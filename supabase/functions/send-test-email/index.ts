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
      "Mike's Plumbing in Tacoma, WA. No website at all. 47 Google reviews, 4.8 star average. Owner name unknown — address the business itself.",
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
      "Green Thumb Landscaping in Olympia, WA. Owner is Sandra. They have a website but it scores 22/100. 31 Google reviews, 4.6 star average.",
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
      "Peak Roofing Co in Aberdeen, WA. Owner name unknown. Website scores 38/100. 12 Google reviews, 4.9 star average.",
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
      "Bright Clean Services in Centralia, WA. Owner is Maria. Website scores 14/100. 89 Google reviews, 4.7 star average.",
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
      "Sunrise HVAC in Hoquiam, WA. Owner is Dave. No website at all. 8 Google reviews, 5.0 star average.",
  },
];

const SYSTEM_PROMPT =
  "You write cold outreach emails for a web design service. Under 150 words. Open by genuinely complimenting the business — their reviews, rating, or trade reputation. Never use the words: outdated, old, bad, broken, slow, behind, losing, competitors. Frame any website gap as 'your online presence hasn't caught up with the quality of your work yet.' Mention a free no-strings mock website preview built for them. One CTA only: reply 'interested' or book a 10-minute call. Sign off as Bradford Hemminger from WA USA. End every email with: 'Reply STOP anytime — no hard feelings.' Plain words. Short sentences. Grade 6 reading level. Feels like a neighbor, not a marketer. Output subject line first then email body. Nothing else.";

const RECIPIENT = "b.hemminger18@gmail.com";
const FROM_ADDRESS = "Outreach OS <onboarding@resend.dev>";
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
    const m = normalizedLine.match(/^subject\s*[:\-]\s*(.+)$/i);
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
      const rawText: string = d?.content?.map((c: any) => c.text || "").join("\n").trim() || "";
      return { rawText, model };
    }
    const t = await res.text();
    errs.push(`${model}: ${res.status} ${t}`);
    if (![400, 404].includes(res.status)) break;
  }
  throw new Error(`Claude unavailable. Tried: ${errs.join(" | ")}`);
}

async function upsertLead(supabase: any, scenario: typeof SCENARIOS[number]): Promise<string | null> {
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
    const { subject, body: emailBody } = parseSubjectAndBody(rawText);
    const wc = wordCount(emailBody);

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [RECIPIENT],
        subject: `[${scenario.name}] ${subject}`,
        text: emailBody,
      }),
    });
    const resendData = await resendRes.json().catch(() => ({}));
    const delivered = resendRes.ok;

    // Log outreach + activity
    if (leadId) {
      await supabase.from("outreach_emails").insert({
        lead_id: leadId,
        subject,
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
        subject,
        body: emailBody,
        fullEmail: `Subject: ${subject}\n\n${emailBody}`,
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
