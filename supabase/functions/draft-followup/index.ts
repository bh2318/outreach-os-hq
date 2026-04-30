// Draft a follow-up outreach email via Claude using Brad's follow-up prompt.
// Body: { leadId, sequenceNumber? } -> { success, draft, subject, model }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CLAUDE_MODELS = [
  "claude-haiku-4-5-20251001",
  "claude-haiku-3-5-20251001",
  "claude-sonnet-4-5-20250929",
];

const SYSTEM_PROMPT =
  "You are Brad Hemminger writing a short follow-up email to a local business owner who has not replied to your first message. Confident, warm, nonchalant — never eager, never desperate, never pushy. First person throughout. Output subject line on line one, blank line, then email body. Nothing else. Under 90 words total. Subject line is exactly: Following up — and then their business name. First line: one short sentence noting you reached out a few days ago about a free mock site for their business. Second line: one short sentence saying the offer still stands — flat 500 dollars, live within 48 hours, free if not. Third line: one short sentence asking if they want you to send the mock over. Sign off — line one: Brad Hemminger — line two: Reply STOP anytime — no hard feelings. Do NOT include a county line. Do NOT include any location line. Never use: excited, thrilled, just checking in, circling back, touching base, I appreciate, thank you for, getting back to me, amazing, transform, solution. Short sentences, plain words, grade 6 reading level.";

function ensureCountySuffix(county: string) {
  const c = (county || "").trim();
  if (!c) return "";
  return /county$/i.test(c) ? c : `${c} County`;
}

async function draftWithClaude(apiKey: string, userMessage: string) {
  const errs: string[] = [];
  for (const model of CLAUDE_MODELS) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 250,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      }),
    });
    if (res.ok) {
      const d = await res.json();
      const text: string = d?.content?.map((c: { text?: string }) => c.text || "").join("\n").trim() || "";
      return { text, model };
    }
    const t = await res.text();
    errs.push(`${model}: ${res.status} ${t}`);
    if (![400, 404].includes(res.status)) break;
  }
  throw new Error(`Claude unavailable. Tried: ${errs.join(" | ")}`);
}

function splitSubjectBody(full: string, fallbackSubject: string) {
  const lines = full.split(/\r?\n/);
  let subject = fallbackSubject;
  let bodyStart = 0;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    if (!l) continue;
    subject = l.replace(/^subject:\s*/i, "");
    bodyStart = i + 1;
    break;
  }
  const body = lines.slice(bodyStart).join("\n").trim();
  return { subject, body: body || full };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const ANTHROPIC = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC) throw new Error("ANTHROPIC_API_KEY not configured");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const { leadId } = await req.json();
    if (!leadId) throw new Error("leadId required");

    const { data: lead, error } = await supabase
      .from("leads")
      .select("id,business_name,city,state,county,niche,rating,review_count,last_contacted")
      .eq("id", leadId)
      .single();
    if (error || !lead) throw new Error(`Lead not found: ${error?.message}`);

    const fullCounty = ensureCountySuffix(lead.county || lead.city || "");
    const userMessage = [
      `business_name: ${lead.business_name}`,
      `niche: ${lead.niche ?? ""}`,
      `city: ${lead.city ?? ""}`,
      `state: ${lead.state ?? ""}`,
      `county: ${fullCounty}`,
      `rating: ${lead.rating ?? "n/a"}`,
      `review_count: ${lead.review_count ?? 0}`,
      "",
      "Write the follow-up email now.",
    ].join("\n");

    const { text, model } = await draftWithClaude(ANTHROPIC, userMessage);
    const fallback = `Following up — ${lead.business_name}`;
    const { subject, body } = splitSubjectBody(text, fallback);

    return new Response(
      JSON.stringify({ success: true, draft: body, subject, model }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("draft-followup error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
