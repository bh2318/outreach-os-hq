// send-daily-outreach
// Daily outreach scheduler. Sends up to 250 cold emails to leads with status='new'
// and outreach_count=0, spaced ~2.88 minutes apart across a 12-hour window.
//
// SAFETY: Sending is currently BLOCKED until a verified Resend domain is configured.
// While blocked, the function still runs the loop, generates email drafts via Claude,
// logs everything to outreach_emails / activity_log, and updates lead status — but
// does NOT actually call Resend. Flip SENDING_ENABLED to true once a domain is live.
//
// Controlled by settings.outreach_active. If false, returns immediately.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// === Hard guards ===
const SENDING_ENABLED = false;          // flip to true once Resend domain is verified
const MAX_PER_DAY = 250;
const WINDOW_HOURS = 12;
const SPACING_MS = Math.floor((WINDOW_HOURS * 60 * 60 * 1000) / MAX_PER_DAY); // ~172800ms = 2.88 min
const REPLY_TO = "b.h.weboutreach@gmail.com";
const FROM_ADDRESS = `Brad Hemminger <${Deno.env.get("RESEND_FROM_EMAIL") ?? ""}>`;

const PROMPT_SYSTEM =
  "You are Brad Hemminger writing a cold outreach email to a local business owner. Confident, warm, nonchalant. Output subject line on line one, blank line, then email body, nothing else. Subject line is exactly the words Quick question for followed by the business name. First sentence: one genuine specific compliment about their actual review count and star rating, one sentence only, make it feel observed. Second paragraph: exactly this sentence and nothing else: I think your business is leaving money on the table without a proper website and I would love to show you what I mean. Third paragraph: two sentences maximum telling them you can put together a free mock website and send it over with a full quote and everything they need to know about the process. Closing line exactly: No obligation, no cost — I am ready to help. Your business deserves an online presence that mirrors everything you have built. Immediately before the sign off, on its own line, include exactly this sentence: Quick question — what is the single most important thing your website needs to do for your business? Sign off: Brad Hemminger on one line, then exactly: Reply STOP anytime — no hard feelings. Do NOT include a county line. Do NOT include any location line. Never use: here's the thing, potential customers, fix this, convert, strings attached, we build, excited, thrilled, solution, transform, caught up, just reply, Bradford. Short sentences, max 20 words each, grade 6 reading level, first person throughout.";

interface Lead {
  id: string;
  business_name: string;
  email: string | null;
  niche: string | null;
  city: string | null;
  state: string | null;
  county: string | null;
  website_url: string | null;
  rating: number | null;
  review_count: number | null;
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
county: ${lead.county ?? lead.city ?? ""}
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
  if (!res.ok) {
    throw new Error(`claude ${res.status}: ${await res.text()}`);
  }
  const d = await res.json();
  const text: string = (d?.content?.[0]?.text ?? "").trim();
  return parseSubjectAndBody(text, lead.business_name);
}

async function sendViaResend(resendKey: string, to: string, subject: string, body: string) {
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
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`resend ${res.status}: ${JSON.stringify(json)}`);
  return json.id as string | undefined;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANTHROPIC = Deno.env.get("ANTHROPIC_API_KEY");
    const RESEND = Deno.env.get("RESEND_API_KEY");
    if (!ANTHROPIC) throw new Error("ANTHROPIC_API_KEY not configured");

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // 1. Check master switch
    const { data: settings, error: settingsErr } = await supabase
      .from("settings")
      .select("outreach_active")
      .eq("id", 1)
      .maybeSingle();
    if (settingsErr) throw new Error(`settings read failed: ${settingsErr.message}`);
    if (!settings?.outreach_active) {
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "outreach_active=false" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 2. Pull eligible leads (status=new, outreach_count=0, has email)
    const { data: leads, error: leadsErr } = await supabase
      .from("leads")
      .select("id,business_name,email,niche,city,state,county,website_url,rating,review_count")
      .eq("status", "new")
      .eq("outreach_count", 0)
      .not("email", "is", null)
      .order("created_at", { ascending: true })
      .limit(MAX_PER_DAY);
    if (leadsErr) throw new Error(`leads read failed: ${leadsErr.message}`);

    if (!leads || leads.length === 0) {
      return new Response(
        JSON.stringify({ success: true, processed: 0, message: "no eligible leads" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let sent = 0;
    let failed = 0;
    let blocked = 0;

    for (let i = 0; i < leads.length; i++) {
      const lead = leads[i] as Lead;
      try {
        const { subject, body } = await generateEmail(ANTHROPIC, lead);

        let sendStatus: "sent" | "blocked" | "failed" = "blocked";
        let resendId: string | undefined;

        if (SENDING_ENABLED && RESEND && lead.email) {
          resendId = await sendViaResend(RESEND, lead.email, subject, body);
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

      // Pace sends across the 12-hour window. Skip the wait on the final iteration.
      if (i < leads.length - 1) await sleep(SPACING_MS);
    }

    return new Response(
      JSON.stringify({
        success: true,
        eligible: leads.length,
        sent,
        blocked,
        failed,
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
