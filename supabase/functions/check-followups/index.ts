// check-followups
// Daily cron job (15:00 UTC). For every contacted lead with no reply:
// - calculates days since last_contacted
// - if days matches one of [4, 9, 18], generates a follow-up draft via Claude
// - upserts a row into followup_queue (lead_id + sequence_number unique while sent=false)
// The Follow-Ups tab reads from followup_queue.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const FOLLOWUP_DAYS = [4, 9, 18];

const FOLLOWUP_PROMPT_BASE =
  "You are Brad Hemminger writing a short follow-up email to a local business owner who has not replied to your first message. Confident, warm, nonchalant — never eager, never desperate, never pushy. First person throughout. Output subject line on line one, blank line, then email body. Nothing else. Under 90 words total. Subject line is exactly: Following up — and then their business name. Sign off — line one: Brad Hemminger — line two: their county name followed by County — line three: Reply STOP anytime — no hard feelings. Never use: excited, thrilled, just checking in, circling back, touching base, I appreciate, thank you for, getting back to me, amazing, transform, solution. Short sentences, plain words, grade 6 reading level.";

function ensureCountySuffix(c: string) {
  const v = (c || "").trim();
  if (!v) return "";
  return /county$/i.test(v) ? v : `${v} County`;
}

function parseSubjectAndBody(text: string, businessName: string) {
  const trimmed = text.trim();
  const lines = trimmed.split(/\r?\n/);
  let subject = `Following up — ${businessName}`;
  let body = trimmed;
  if (lines.length > 1) {
    const first = lines[0].trim();
    if (first.length > 0 && first.length < 160) {
      subject = first.replace(/^subject:\s*/i, "");
      body = lines.slice(1).join("\n").trim();
    }
  }
  return { subject, body };
}

async function draftFollowup(apiKey: string, system: string, user: string) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 350,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) throw new Error(`claude ${res.status}: ${await res.text()}`);
  const d = await res.json();
  return (d?.content?.[0]?.text ?? "").trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANTHROPIC = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC) throw new Error("ANTHROPIC_API_KEY not configured");
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // Pull all contacted leads with no reply
    const { data: leads, error: leadsErr } = await supabase
      .from("leads")
      .select("id,business_name,city,state,county,niche,rating,review_count,last_contacted,outreach_count,status")
      .eq("status", "contacted")
      .gt("outreach_count", 0)
      .not("last_contacted", "is", null);
    if (leadsErr) throw new Error(`leads read failed: ${leadsErr.message}`);

    let queued = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const lead of leads ?? []) {
      try {
        // exclude leads that have a reply
        const { count: replyCount } = await supabase
          .from("replies")
          .select("id", { count: "exact", head: true })
          .eq("lead_id", lead.id);
        if ((replyCount ?? 0) > 0) { skipped++; continue; }

        const last = new Date(lead.last_contacted as string);
        const days = Math.floor((Date.now() - last.getTime()) / (1000 * 60 * 60 * 24));
        const matchIdx = FOLLOWUP_DAYS.indexOf(days);
        if (matchIdx === -1) { skipped++; continue; }
        const sequenceNumber = matchIdx + 2; // first outreach = 1; first follow-up = 2

        // Skip if a pending row already exists for this lead+sequence
        const { count: existing } = await supabase
          .from("followup_queue")
          .select("id", { count: "exact", head: true })
          .eq("lead_id", lead.id)
          .eq("sequence_number", sequenceNumber)
          .eq("sent", false);
        if ((existing ?? 0) > 0) { skipped++; continue; }

        const fullCounty = ensureCountySuffix(lead.county || lead.city || "");
        const userMsg = [
          `business_name: ${lead.business_name}`,
          `niche: ${lead.niche ?? ""}`,
          `city: ${lead.city ?? ""}`,
          `state: ${lead.state ?? ""}`,
          `county: ${fullCounty}`,
          `rating: ${lead.rating ?? "n/a"}`,
          `review_count: ${lead.review_count ?? 0}`,
          `days_since_last_contact: ${days}`,
          `followup_number: ${sequenceNumber - 1} (${days === 4 ? "first" : days === 9 ? "second" : "final"})`,
          "",
          "Write the follow-up email now.",
        ].join("\n");

        const text = await draftFollowup(ANTHROPIC, FOLLOWUP_PROMPT_BASE, userMsg);
        const { subject, body } = parseSubjectAndBody(text, lead.business_name);

        await supabase.from("followup_queue").insert({
          lead_id: lead.id,
          business_name: lead.business_name,
          sequence_number: sequenceNumber,
          draft_subject: subject,
          draft_body: body,
          due_date: new Date().toISOString().slice(0, 10),
          sent: false,
        });
        queued++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`${lead.business_name}: ${msg}`);
      }
    }

    return new Response(
      JSON.stringify({ success: true, scanned: leads?.length ?? 0, queued, skipped, errors }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[check-followups] fatal", e);
    return new Response(
      JSON.stringify({ success: false, error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
