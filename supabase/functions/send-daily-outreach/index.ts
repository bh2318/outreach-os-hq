// send-daily-outreach
// Daily outreach scheduler. Sends up to MAX_PER_DAY cold emails.
// Adds:
//  - Pacific time window enforcement (settings.pacific_send_start/end)
//  - Airtight dedupe: skip a lead if any combination of 2 of 3 fields
//    (phone, business_name, address) matches an existing already-contacted lead
//  - Priority order: no website > site_score > 80 > review_count > 50 > rest
//  - Open tracking enabled on every Resend send
// Controlled by settings.outreach_active. If false, returns immediately.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SENDING_ENABLED = false;          // flip to true once Resend domain is verified
const MAX_PER_DAY = 250;
const WINDOW_HOURS = 12;
const SPACING_MS = Math.floor((WINDOW_HOURS * 60 * 60 * 1000) / MAX_PER_DAY);
const REPLY_TO = "b.h.weboutreach@gmail.com";
const FROM_ADDRESS = `Brad Hemminger <${Deno.env.get("RESEND_FROM_EMAIL") ?? ""}>`;

const PROMPT_SYSTEM =
  "You are Brad Hemminger writing a cold outreach email to a local business owner. Confident, warm, nonchalant. Output subject line on line one, blank line, then email body, nothing else. Subject line is exactly the words Quick question for followed by the business name. First sentence: one genuine specific compliment about their actual review count and star rating, one sentence only, make it feel observed. Second paragraph: exactly this sentence and nothing else: I think your business is leaving money on the table without a proper website and I would love to show you what I mean. Third paragraph: two sentences maximum telling them you can put together a free mock website and send it over with a full quote and everything they need to know about the process. Closing line exactly: No obligation, no cost — I am ready to help. Your business deserves an online presence that mirrors everything you have built. Immediately before the sign off, on its own line, include exactly this sentence: Quick question — what is the single most important thing your website needs to do for your business? Sign off: Brad Hemminger on one line, then exactly: Reply STOP anytime — no hard feelings. Do NOT include a county line. Do NOT include any location line. Never use: here's the thing, potential customers, fix this, convert, strings attached, we build, excited, thrilled, solution, transform, caught up, just reply, Bradford. Short sentences, max 20 words each, grade 6 reading level, first person throughout.";

interface Lead {
  id: string;
  business_name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  niche: string | null;
  city: string | null;
  state: string | null;
  county: string | null;
  website_url: string | null;
  rating: number | null;
  review_count: number | null;
  site_score: number | null;
}

function parseSubjectAndBody(text: string, businessName: string) {
  const trimmed = text.trim();
  const lines = trimmed.split(/\r?\n/);
  let subject = `Quick question for ${businessName}`;
  let body = trimmed;
  if (lines.length > 1) {
    const first = lines[0].trim();
    if (first.length > 0 && first.length < 120) {
      subject = first.replace(/^subject:\s*/i, "");
      body = lines.slice(1).join("\n").trim();
    }
  }
  return { subject, body };
}

async function generateEmail(anthropic: string, lead: Lead): Promise<{ subject: string; body: string }> {
  const userMsg = `business_name: ${lead.business_name}
niche: ${lead.niche ?? "local business"}
city: ${lead.city ?? ""}
state: ${lead.state ?? ""}
has_website: ${lead.website_url ? "yes" : "no"}
rating: ${lead.rating ?? "n/a"}
review_count: ${lead.review_count ?? 0}

Write the cold email now.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": anthropic,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      system: PROMPT_SYSTEM,
      messages: [{ role: "user", content: userMsg }],
    }),
  });
  if (!res.ok) throw new Error(`claude ${res.status}: ${await res.text()}`);
  const d = await res.json();
  const text: string = (d?.content?.[0]?.text ?? "").trim();
  return parseSubjectAndBody(text, lead.business_name);
}

async function sendViaResend(resendKey: string, to: string, subject: string, body: string, leadId: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: [to],
      reply_to: REPLY_TO,
      subject,
      text: body,
      tracking: { opens: true },
      headers: { "X-Lead-Id": leadId },
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`resend ${res.status}: ${JSON.stringify(json)}`);
  return json.id as string | undefined;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function getPacificHHMM(): string {
  // Format current time in America/Los_Angeles as HH:MM (24h).
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const h = parts.find((p) => p.type === "hour")?.value ?? "00";
  const m = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${h}:${m}`;
}

function inWindow(nowHHMM: string, start: string, end: string): boolean {
  // Compare lex string HH:MM
  const s = start.slice(0, 5);
  const e = end.slice(0, 5);
  return nowHHMM >= s && nowHHMM <= e;
}

function norm(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().replace(/\s+/g, " ").replace(/[^\w\s]/g, "").trim();
}

function normPhone(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANTHROPIC = Deno.env.get("ANTHROPIC_API_KEY");
    const RESEND = Deno.env.get("RESEND_API_KEY");
    if (!ANTHROPIC) throw new Error("ANTHROPIC_API_KEY not configured");

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // 1. Master switch + sending hours
    const { data: settings } = await supabase
      .from("settings")
      .select("outreach_active, pacific_send_start, pacific_send_end")
      .eq("id", 1)
      .maybeSingle();
    if (!settings?.outreach_active) {
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "outreach_active=false" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const nowPacific = getPacificHHMM();
    const startTime = (settings as any).pacific_send_start ?? "08:00:00";
    const endTime = (settings as any).pacific_send_end ?? "18:00:00";
    if (!inWindow(nowPacific, startTime, endTime)) {
      await supabase.from("activity_log").insert({
        action_type: "system",
        detail: `Outreach paused — outside sending hours (Pacific ${nowPacific}, window ${startTime}-${endTime})`,
        outcome: "warning",
      });
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "outside_window", nowPacific }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 2. Fetch already-contacted leads for dedupe
    const { data: contacted } = await supabase
      .from("leads")
      .select("business_name, phone, address")
      .gt("outreach_count", 0);
    const contactedKeys = (contacted ?? []).map((c) => ({
      name: norm(c.business_name as string),
      phone: normPhone(c.phone as string),
      addr: norm(c.address as string),
    }));

    // 3. Pull unsubscribed list
    const { data: blacklist } = await supabase.from("unsubscribed").select("email");
    const blockedEmails = new Set((blacklist ?? []).map((r: { email: string }) => r.email.toLowerCase()));

    // 4. Pull eligible candidates (not yet contacted, not unsubscribed, has email)
    const { data: leadsRaw, error: leadsErr } = await supabase
      .from("leads")
      .select("id,business_name,email,phone,address,niche,city,state,county,website_url,rating,review_count,site_score,status")
      .eq("status", "new")
      .eq("outreach_count", 0)
      .eq("archived", false)
      .not("email", "is", null)
      .limit(MAX_PER_DAY * 3);
    if (leadsErr) throw new Error(`leads read failed: ${leadsErr.message}`);

    const candidates = (leadsRaw ?? []).filter(
      (l) => l.email && !blockedEmails.has(String(l.email).toLowerCase()),
    ) as Lead[];

    // 5. Airtight dedupe — skip if any 2 of 3 match an existing contacted lead
    const dupSkipped: string[] = [];
    const eligible: Lead[] = [];
    for (const cand of candidates) {
      const cn = norm(cand.business_name);
      const cp = normPhone(cand.phone);
      const ca = norm(cand.address);
      const isDup = contactedKeys.some((k) => {
        const matches = [
          cn && k.name && cn === k.name,
          cp && k.phone && cp === k.phone,
          ca && k.addr && ca === k.addr,
        ].filter(Boolean).length;
        return matches >= 2;
      });
      if (isDup) {
        dupSkipped.push(cand.business_name);
        await supabase.from("activity_log").insert({
          action_type: "system",
          business_name: cand.business_name,
          lead_id: cand.id,
          detail: "Duplicate skipped — matches existing contacted lead on phone/name/address",
          outcome: "warning",
        });
        continue;
      }
      eligible.push(cand);
    }

    // 6. Priority sort: no-website first, then site_score>80, then review_count>50, then rest
    function priorityRank(l: Lead): number {
      if (!l.website_url) return 0;
      if ((l.site_score ?? 0) > 80) return 1;
      if ((l.review_count ?? 0) > 50) return 2;
      return 3;
    }
    eligible.sort((a, b) => priorityRank(a) - priorityRank(b));
    const leads = eligible.slice(0, MAX_PER_DAY);

    if (!leads.length) {
      return new Response(
        JSON.stringify({ success: true, processed: 0, dupSkipped: dupSkipped.length, message: "no eligible leads" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let sent = 0;
    let failed = 0;
    let blocked = 0;

    for (let i = 0; i < leads.length; i++) {
      const lead = leads[i];
      try {
        const { subject, body } = await generateEmail(ANTHROPIC, lead);

        let sendStatus: "sent" | "blocked" | "failed" = "blocked";
        let resendId: string | undefined;

        if (SENDING_ENABLED && RESEND && lead.email) {
          resendId = await sendViaResend(RESEND, lead.email, subject, body, lead.id);
          sendStatus = "sent";
          sent++;
        } else {
          blocked++;
        }

        const now = new Date().toISOString();
        await supabase.from("outreach_emails").insert({
          lead_id: lead.id,
          sequence_number: 1,
          subject,
          body,
          status: sendStatus,
          sent_at: sendStatus === "sent" ? now : null,
        });

        if (sendStatus === "sent") {
          await supabase
            .from("leads")
            .update({ status: "contacted", last_contacted: now, outreach_count: 1 })
            .eq("id", lead.id);
        }

        await supabase.from("activity_log").insert({
          action_type: sendStatus === "sent" ? "emailed" : "system",
          business_name: lead.business_name,
          lead_id: lead.id,
          detail: sendStatus === "sent"
            ? `daily outreach sent to ${lead.email} (resend_id=${resendId ?? "n/a"})`
            : `daily outreach DRAFT generated (sending blocked — verify Resend domain)`,
          outcome: sendStatus === "sent" ? "success" : "warning",
        });
      } catch (e) {
        failed++;
        console.error(`[send-daily-outreach] lead ${lead.id} failed`, e);
        await supabase.from("activity_log").insert({
          action_type: "system",
          business_name: lead.business_name,
          lead_id: lead.id,
          detail: `daily outreach FAILED: ${e instanceof Error ? e.message : String(e)}`,
          outcome: "failed",
        });
      }

      if (i < leads.length - 1) await sleep(SPACING_MS);
    }

    return new Response(
      JSON.stringify({
        success: true,
        eligible: leads.length,
        sent,
        blocked,
        failed,
        dupSkipped: dupSkipped.length,
        sending_enabled: SENDING_ENABLED,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[send-daily-outreach] fatal", e);
    return new Response(
      JSON.stringify({ success: false, error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
