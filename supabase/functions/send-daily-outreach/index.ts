// send-daily-outreach
// Unified outreach cycle. Fires every minute via pg_cron.
// Gates inside the function:
//  - settings.outreach_active must be true
//  - settings.sending_enabled must be true
//  - now must be within Pacific sending window
//  - it must be at least settings.minutes_between_cycles since last_cycle_at
//  - daily_email_cap must not be reached
// Each cycle:
//  1. Pull eligible "new" leads. If none, scrape a fresh WA city+niche.
//  2. Process up to leads_per_cycle leads.
//  3. Resolve email (lead.email > contact@<domain> > phone_only).
//  4. Generate email via Claude haiku, send via Resend, log everything.
//  5. Update last_cycle_at + last_cycle_completed_at on settings.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const REPLY_TO = "weboutreach@bhsites.com";

// Washington-state cities + business niches the scraper rotates through.
const WA_CITIES = [
  "Seattle, WA", "Tacoma, WA", "Spokane, WA", "Bellevue, WA", "Vancouver, WA",
  "Kent, WA", "Everett, WA", "Renton, WA", "Yakima, WA", "Federal Way, WA",
  "Kirkland, WA", "Bellingham, WA", "Auburn, WA", "Pasco, WA", "Marysville, WA",
  "Lakewood, WA", "Redmond, WA", "Shoreline, WA", "Olympia, WA", "Richland, WA",
  "Kennewick, WA", "Sammamish, WA", "Burien, WA", "Bothell, WA", "Edmonds, WA",
  "Puyallup, WA", "Lynnwood, WA", "Bremerton, WA", "Issaquah, WA", "Wenatchee, WA",
];
const NICHES = [
  "plumber", "electrician", "roofer", "landscaper", "hvac contractor",
  "auto repair shop", "house painter", "general contractor", "pest control",
  "carpet cleaner", "window cleaner", "fence contractor", "concrete contractor",
  "tree service", "appliance repair", "locksmith", "moving company",
  "junk removal", "pressure washing", "handyman",
];

function pickCityAndNiche(seed: number): { city: string; niche: string } {
  const c = WA_CITIES[seed % WA_CITIES.length];
  const n = NICHES[Math.floor(seed / WA_CITIES.length) % NICHES.length];
  return { city: c, niche: n };
}

function resolveOutreachEmail(lead: { email: string | null; website_url: string | null }): string | null {
  if (lead.email && lead.email.trim()) return lead.email.trim();
  const url = (lead.website_url ?? "").trim();
  if (!url) return null;
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    const host = u.hostname.replace(/^www\./i, "");
    if (!host || !host.includes(".")) return null;
    return `contact@${host}`;
  } catch {
    return null;
  }
}

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

async function sendViaResend(resendKey: string, fromAddress: string, to: string, subject: string, body: string, leadId: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromAddress,
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

function getPacificHHMM(): string {
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
  const s = start.slice(0, 5);
  const e = end.slice(0, 5);
  return nowHHMM >= s && nowHHMM <= e;
}

async function logActivity(
  supabase: any,
  args: { action_type: string; business_name?: string | null; lead_id?: string | null; detail: string; outcome?: string },
) {
  await supabase.from("activity_log").insert({
    action_type: args.action_type,
    business_name: args.business_name ?? null,
    lead_id: args.lead_id ?? null,
    detail: args.detail,
    outcome: args.outcome ?? "success",
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANTHROPIC = Deno.env.get("ANTHROPIC_API_KEY");
    const RESEND = Deno.env.get("RESEND_API_KEY");
    const FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL") || "weboutreach@bhsites.com";
    if (!ANTHROPIC) throw new Error("ANTHROPIC_API_KEY not configured");
    if (!RESEND) throw new Error("RESEND_API_KEY not configured");
    const FROM_ADDRESS = `Brad Hemminger <${FROM_EMAIL}>`;

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // 1. Read settings (the source of truth for every gate)
    const { data: settings } = await supabase
      .from("settings")
      .select("outreach_active, sending_enabled, pacific_send_start, pacific_send_end, leads_per_cycle, minutes_between_cycles, daily_email_cap, last_cycle_at")
      .eq("id", 1)
      .maybeSingle();

    if (!settings?.outreach_active) {
      return new Response(JSON.stringify({ skipped: true, reason: "outreach_active=false" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!(settings as any).sending_enabled) {
      return new Response(JSON.stringify({ skipped: true, reason: "sending_disabled" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const minutesBetween = Math.max(1, Math.min(60, Number((settings as any).minutes_between_cycles ?? 5)));
    const leadsPerCycle = Math.max(1, Math.min(20, Number((settings as any).leads_per_cycle ?? 1)));
    const dailyCap = Math.max(1, Math.min(1500, Number((settings as any).daily_email_cap ?? 288)));

    // Interval gate
    const lastCycleAt = (settings as any).last_cycle_at as string | null;
    if (lastCycleAt) {
      const elapsed = Date.now() - new Date(lastCycleAt).getTime();
      const required = minutesBetween * 60 * 1000;
      if (elapsed < required - 5000) {
        return new Response(JSON.stringify({ skipped: true, reason: "interval_gate", elapsedMs: elapsed, requiredMs: required }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Sending window gate
    const nowPacific = getPacificHHMM();
    const startTime = (settings as any).pacific_send_start ?? "08:00:00";
    const endTime = (settings as any).pacific_send_end ?? "18:00:00";
    if (!inWindow(nowPacific, startTime, endTime)) {
      await logActivity(supabase, {
        action_type: "system",
        detail: `Outside sending window — cycle skipped (Pacific ${nowPacific}, window ${startTime.slice(0, 5)}–${endTime.slice(0, 5)})`,
        outcome: "warning",
      });
      await supabase.from("settings").update({ last_cycle_at: new Date().toISOString() } as any).eq("id", 1);
      return new Response(JSON.stringify({ skipped: true, reason: "outside_window" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Daily cap gate
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    const { count: sentToday } = await supabase
      .from("outreach_emails")
      .select("id", { count: "exact", head: true })
      .eq("status", "sent")
      .gte("sent_at", startOfDay.toISOString());
    if ((sentToday ?? 0) >= dailyCap) {
      await logActivity(supabase, {
        action_type: "system",
        detail: `Daily cap reached — ${sentToday}/${dailyCap} emails sent today. No further outreach until tomorrow.`,
        outcome: "warning",
      });
      await supabase.from("settings").update({ last_cycle_at: new Date().toISOString() } as any).eq("id", 1);
      return new Response(JSON.stringify({ skipped: true, reason: "daily_cap_reached", sentToday, dailyCap }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const remainingCap = dailyCap - (sentToday ?? 0);
    const cycleLimit = Math.min(leadsPerCycle, remainingCap);

    // Mark cycle started
    const cycleStartedAt = new Date().toISOString();
    await supabase.from("settings").update({ last_cycle_at: cycleStartedAt } as any).eq("id", 1);

    // 2. Look for "new" leads
    let { data: leadsRaw } = await supabase
      .from("leads")
      .select("id,business_name,email,phone,address,niche,city,state,website_url,rating,review_count,site_score,status")
      .eq("status", "new")
      .eq("archived", false)
      .order("site_score", { ascending: false })
      .limit(cycleLimit);

    // If empty, scrape a fresh WA city+niche
    if (!leadsRaw || leadsRaw.length === 0) {
      const seed = Math.floor(Date.now() / (60 * 1000));
      const { city, niche } = pickCityAndNiche(seed);
      await logActivity(supabase, {
        action_type: "scraper",
        detail: `Cycle started — searching ${niche} in ${city}`,
        outcome: "success",
      });
      try {
        const { data: scrapeRes, error: scrapeErr } = await supabase.functions.invoke("scrape-places", {
          body: { niche, city },
        });
        if (scrapeErr) throw scrapeErr;
        const found = (scrapeRes as any)?.businesses?.length ?? 0;
        await logActivity(supabase, {
          action_type: "scraper",
          detail: `Found ${found} qualified ${niche} businesses in ${city}`,
          outcome: "success",
        });
      } catch (e) {
        await logActivity(supabase, {
          action_type: "system",
          detail: `Scrape failed for ${niche} in ${city}: ${e instanceof Error ? e.message : String(e)}`,
          outcome: "failed",
        });
      }
      const refetch = await supabase
        .from("leads")
        .select("id,business_name,email,phone,address,niche,city,state,website_url,rating,review_count,site_score,status")
        .eq("status", "new")
        .eq("archived", false)
        .order("site_score", { ascending: false })
        .limit(cycleLimit);
      leadsRaw = refetch.data;
    } else {
      await logActivity(supabase, {
        action_type: "scraper",
        detail: `Cycle started — ${leadsRaw.length} qualified lead${leadsRaw.length === 1 ? "" : "s"} ready`,
        outcome: "success",
      });
    }

    const leads = (leadsRaw ?? []) as Lead[];
    let sent = 0;
    let phoneOnly = 0;
    let failed = 0;

    for (const lead of leads) {
      const dest = resolveOutreachEmail(lead);
      if (!dest) {
        await supabase.from("leads").update({ status: "phone_only" }).eq("id", lead.id);
        await logActivity(supabase, {
          action_type: "system",
          business_name: lead.business_name,
          lead_id: lead.id,
          detail: `Phone-only lead — ${lead.business_name} (${lead.phone ?? "no phone"}) has no email or website`,
          outcome: "warning",
        });
        phoneOnly++;
        continue;
      }
      try {
        const { subject, body } = await generateEmail(ANTHROPIC, lead);
        const resendId = await sendViaResend(RESEND, FROM_ADDRESS, dest, subject, body, lead.id);
        const now = new Date().toISOString();
        await supabase.from("outreach_emails").insert({
          lead_id: lead.id,
          sequence_number: 1,
          subject,
          body,
          status: "sent",
          sent_at: now,
        });
        await supabase
          .from("leads")
          .update({ status: "contacted", last_contacted: now, outreach_count: 1 })
          .eq("id", lead.id);
        await logActivity(supabase, {
          action_type: "emailed",
          business_name: lead.business_name,
          lead_id: lead.id,
          detail: `Outreach sent to ${dest} (${lead.business_name}, ${lead.city ?? "—"}) [resend:${resendId ?? "n/a"}]`,
          outcome: "success",
        });
        sent++;
      } catch (e) {
        failed++;
        await logActivity(supabase, {
          action_type: "system",
          business_name: lead.business_name,
          lead_id: lead.id,
          detail: `Outreach failed for ${lead.business_name}: ${e instanceof Error ? e.message : String(e)}`,
          outcome: "failed",
        });
      }
    }

    const completedAt = new Date().toISOString();
    await supabase.from("settings").update({ last_cycle_completed_at: completedAt } as any).eq("id", 1);
    await logActivity(supabase, {
      action_type: "scraper",
      detail: `Cycle complete — ${sent} sent, ${phoneOnly} phone-only, ${failed} failed`,
      outcome: "success",
    });

    return new Response(JSON.stringify({ success: true, sent, phoneOnly, failed, processed: leads.length }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[send-daily-outreach] fatal", e);
    return new Response(JSON.stringify({ success: false, error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
