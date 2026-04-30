// Edge function: send-test-email
// Generates ONE cold outreach email with Claude and sends via Resend.
// Also seeds/upserts the test business as a real lead row.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const SCENARIOS = [
  {
    key: "mikes-plumbing",
    name: "Mike's Plumbing",
    owner_name: null,
    city: "Tacoma",
    state: "WA",
    county: "Pierce County",
    niche: "plumber",
    review_count: 47,
    rating: 4.8,
    website_url: null,
    site_score: null,
    brief:
      "Mike's Plumbing in Tacoma, Pierce County, WA. No website at all. 47 Google reviews, 4.8 star average. Owner name unknown — address the business itself. Sign-off county line must read exactly: Pierce County.",
  },
  {
    key: "green-thumb",
    name: "Green Thumb Landscaping",
    owner_name: "Sandra",
    city: "Olympia",
    state: "WA",
    county: "Thurston County",
    niche: "landscaper",
    review_count: 31,
    rating: 4.6,
    website_url: "https://greenthumb.example.com",
    site_score: 22,
    brief:
      "Green Thumb Landscaping in Olympia, Thurston County, WA. Owner is Sandra. They have a website but it scores 22/100. 31 Google reviews, 4.6 star average. Sign-off county line must read exactly: Thurston County.",
  },
  {
    key: "peak-roofing",
    name: "Peak Roofing Co",
    owner_name: null,
    city: "Aberdeen",
    state: "WA",
    county: "Grays Harbor County",
    niche: "roofer",
    review_count: 12,
    rating: 4.9,
    website_url: "https://peakroofing.example.com",
    site_score: 38,
    brief:
      "Peak Roofing Co in Aberdeen, Grays Harbor County, WA. Owner name unknown. Website scores 38/100. 12 Google reviews, 4.9 star average. Sign-off county line must read exactly: Grays Harbor County.",
  },
  {
    key: "bright-clean",
    name: "Bright Clean Services",
    owner_name: "Maria",
    city: "Centralia",
    state: "WA",
    county: "Lewis County",
    niche: "cleaner",
    review_count: 89,
    rating: 4.7,
    website_url: "https://brightclean.example.com",
    site_score: 14,
    brief:
      "Bright Clean Services in Centralia, Lewis County, WA. Owner is Maria. Website scores 14/100. 89 Google reviews, 4.7 star average. Sign-off county line must read exactly: Lewis County.",
  },
  {
    key: "sunrise-hvac",
    name: "Sunrise HVAC",
    owner_name: "Dave",
    city: "Hoquiam",
    state: "WA",
    county: "Grays Harbor County",
    niche: "hvac",
    review_count: 8,
    rating: 5.0,
    website_url: null,
    site_score: null,
    brief:
      "Sunrise HVAC in Hoquiam, Grays Harbor County, WA. Owner is Dave. No website at all. 8 Google reviews, 5.0 star average. Sign-off county line must read exactly: Grays Harbor County.",
  },
];

const SYSTEM_PROMPT =
  "You are Brad Hemminger writing a cold outreach email to a local business owner. You are a confident local web designer who knows exactly what he is doing. Your tone is warm, nonchalant, and assured — like a skilled tradesperson who does not need to oversell because the work speaks for itself. Dad energy. Not a salesperson. Not a marketer. A capable professional who noticed something and is offering to help. First person throughout. Never refer to yourself in third person. Output subject line on line one, blank line, then email body. Nothing else. Rule 1 under 150 words total. Rule 2 subject line is exactly Quick question for followed by the business name nothing else. Rule 3 first sentence is one genuine specific compliment about their actual review count and star rating — make it feel like you actually looked them up, one sentence only. Rule 4 second paragraph is exactly this one sentence: I think your business is leaving money on the table without a proper website and I would love to show you what I mean. Rule 5 third paragraph two sentences maximum — tell them you can put together a free mock website and send it over with a full quote and everything they need to know about the process. Rule 6 next line one sentence: Just reply and I will get it all over to you. Rule 7 immediately before the sign off, on its own line, include exactly this sentence: Quick question — what is the single most important thing your website needs to do for your business? Rule 8 sign off — line one: Brad Hemminger — line two: Reply STOP anytime — no hard feelings. Do NOT include a county line. Do NOT include any location line. Rule 9 never use: here's the thing, potential customers, fix this, convert, strings attached, we build, excited, thrilled, solution, transform, caught up, reputation, I appreciate, thank you for, getting back to me. Rule 10 short sentences max 20 words each grade 6 reading level. Rule 11 nonchalant and confident — never eager, never desperate, never over-explaining.";

// Hard-coded test recipient — DO NOT pull from settings/db. Always send test emails here.
const RECIPIENT = "b.h.weboutreach@gmail.com";
const FROM_ADDRESS = `Brad Hemminger <${Deno.env.get("RESEND_FROM_EMAIL") ?? ""}>`;
const CLAUDE_MODELS = [
  "claude-haiku-4-5-20251001",
  "claude-sonnet-4-5-20250929",
  "claude-opus-4-5-20251101",
];

function parseSubjectAndBody(text: string): { subject: string; body: string } {
  const cleaned = text.trim();
  const lines = cleaned.split(/\r?\n/);
  let subject = "";
  let bodyStart = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const normalizedLine = line.replace(/^\*+|\*+$/g, "").trim();
    const m = normalizedLine.match(/^subject\s*[:-]\s*(.+)$/i);
    if (m) subject = m[1].replace(/^\*+|\*+$/g, "").trim();
    else subject = normalizedLine;
    bodyStart = i + 1;
    break;
  }
  while (bodyStart < lines.length && lines[bodyStart].trim() === "") bodyStart++;
  const body = lines.slice(bodyStart).join("\n").trim();
  return { subject: subject || "A quick note for you", body };
}

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

// Ensure the email ends with the canonical STOP line on its own,
// preceded by a Brad Hemminger signature line. No county/location line.
function enforceSignoff(body: string): string {
  const stopLine = "Reply STOP anytime — no hard feelings.";
  const signature = "Brad Hemminger";
  const lines = body.replace(/\r\n/g, "\n").split("\n").map((l) => l.trimEnd());
  while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();

  if (lines.length && /reply\s+stop/i.test(lines[lines.length - 1])) lines.pop();
  while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();

  if (lines.length) {
    const last = lines[lines.length - 1].trim();
    if (/county\b/i.test(last) || /,?\s*(WA|USA|United States)\b/i.test(last)) {
      lines.pop();
    }
  }
  while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();

  if (!lines.length || !/^brad\s+hemminger\s*$/i.test(lines[lines.length - 1].trim())) {
    lines.push(signature);
  }

  lines.push(stopLine);
  return lines.join("\n");
}

async function generateEmailWithClaude(apiKey: string, brief: string) {
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
        messages: [{ role: "user", content: `Write the outreach email for this business:\n\n${brief}` }],
      }),
    });
    if (res.ok) {
      const d = await res.json();
      const rawText: string = d?.content?.map((c: { text?: string }) => c.text || "").join("\n").trim() || "";
      return { rawText, model };
    }
    const t = await res.text();
    errs.push(`${model}: ${res.status} ${t}`);
    if (![400, 404].includes(res.status)) break;
  }
  throw new Error(`Claude unavailable. Tried: ${errs.join(" | ")}`);
}

async function upsertLead(supabase: ReturnType<typeof createClient>, scenario: typeof SCENARIOS[number]): Promise<string | null> {
  // Find existing by business_name
  const { data: existing } = await supabase
    .from("leads")
    .select("id")
    .eq("business_name", scenario.name)
    .maybeSingle();
  if (existing?.id) return existing.id;
  const { data: inserted, error } = await supabase
    .from("leads")
    .insert({
      business_name: scenario.name,
      owner_name: scenario.owner_name,
      city: scenario.city,
      state: scenario.state,
      county: scenario.county,
      niche: scenario.niche,
      website_url: scenario.website_url,
      site_score: scenario.site_score,
      status: "contacted",
      site_audit_json: { review_count: scenario.review_count, rating: scenario.rating },
    })
    .select("id")
    .single();
  if (error) {
    console.error("upsertLead error", error);
    return null;
  }
  return inserted.id;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const ANTHROPIC = Deno.env.get("ANTHROPIC_API_KEY");
    const RESEND = Deno.env.get("RESEND_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!ANTHROPIC) throw new Error("ANTHROPIC_API_KEY not configured");
    if (!RESEND) throw new Error("RESEND_API_KEY not configured");

    const body = await req.json().catch(() => ({}));
    const { scenarioKey } = body as { scenarioKey?: string };
    const scenario =
      SCENARIOS.find((s) => s.key === scenarioKey) ?? SCENARIOS[0];

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const leadId = await upsertLead(supabase, scenario);

    const { rawText, model } = await generateEmailWithClaude(ANTHROPIC, scenario.brief);
    const parsed = parseSubjectAndBody(rawText);
    const subject = parsed.subject;
    const emailBody = enforceSignoff(parsed.body);
    const wc = wordCount(emailBody);

    // Subject must be exactly "Quick question for <business name>" — no brackets, no prefix.
    const cleanSubject = `Quick question for ${scenario.name}`;
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [RECIPIENT],
        reply_to: "b.h.weboutreach@gmail.com",
        subject: cleanSubject,
        text: emailBody,
      }),
    });
    const resendData = await resendRes.json().catch(() => ({}));
    const delivered = resendRes.ok;

    // Log outreach + activity
    if (leadId) {
      await supabase.from("outreach_emails").insert({
        lead_id: leadId,
        subject: cleanSubject,
        body: emailBody,
        sent_at: new Date().toISOString(),
        status: delivered ? "sent" : "failed",
        sequence_number: 1,
      });
      await supabase.from("activity_log").insert({
        lead_id: leadId,
        business_name: scenario.name,
        action_type: "test_email_sent",
        outcome: delivered ? "success" : "failed",
        detail: `Test email sent to ${RECIPIENT}`,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        delivered,
        leadId,
        scenario: scenario.name,
        scenarioKey: scenario.key,
        subject: cleanSubject,
        body: emailBody,
        fullEmail: `Subject: ${cleanSubject}\n\n${emailBody}`,
        wordCount: wc,
        model,
        timestamp: new Date().toISOString(),
        resend: resendData,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("send-test-email error:", err);
    return new Response(
      JSON.stringify({
        success: false,
        delivered: false,
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
