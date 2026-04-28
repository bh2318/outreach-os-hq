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
  "You write cold outreach emails for Brad Hemminger a local web designer. Output the subject line on line one then a blank line then the email body. Nothing else. No labels no preamble. Follow every rule below exactly. Rule 1 under 150 words total. Rule 2 subject line must be exactly Quick question for followed by the business name nothing else. Rule 3 first sentence is one short genuine compliment about their review count or star rating. Rule 4 second paragraph contains exactly this phrase and nothing else changes it: your online presence hasn't quite caught up with your reputation yet. Rule 5 third paragraph tells them Brad can send over a free mock website along with a full quote pricing and everything they need to know about the process. Rule 6 one ask only — just reply and he will send everything over. Rule 7 sign off is exactly two lines — line one is Brad Hemminger — line two is the county name followed by the word County for example Pierce County or Lewis County never write WA or USA or any abbreviation. Rule 8 final line is exactly: Reply STOP anytime — no hard feelings. Rule 9 never use these words or phrases: here's the thing, Bradford, potential customers, fix this, convert, strings attached, we build, excited, thrilled. Rule 10 short sentences plain words grade 6 reading level feels like a real neighbor not a marketer.";

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

// Guarantee the sign-off uses the full "X County" form and ends with the
// required STOP line. Strips any state/country abbreviations the model may
// have appended and replaces the bare county token if needed.
function enforceCountySignoff(body: string, fullCounty: string): string {
  const stopLine = "Reply STOP anytime — no hard feelings.";
  // Normalize the canonical county string ("Pierce County", "Grays Harbor County", etc.)
  const county = fullCounty.trim();
  const bareCounty = county.replace(/\s+County$/i, "").trim();

  let lines = body.replace(/\r\n/g, "\n").split("\n").map((l) => l.trimEnd());
  // Drop trailing blank lines
  while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();

  // Drop existing STOP line variants from the end so we can re-append cleanly.
  if (lines.length && /reply\s+stop/i.test(lines[lines.length - 1])) lines.pop();
  while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();

  // The last remaining line should be the location line. Replace it with the
  // canonical "<X> County" string. If it doesn't look like a location line
  // (e.g. it's the signature itself), append a new county line.
  if (lines.length) {
    const last = lines[lines.length - 1].trim();
    const looksLikeLocation =
      new RegExp(`\\b${bareCounty}\\b`, "i").test(last) ||
      /,?\s*(WA|USA|United States)\b/i.test(last) ||
      /county/i.test(last);
    if (looksLikeLocation) {
      lines[lines.length - 1] = county;
    } else {
      lines.push(county);
    }
  } else {
    lines.push(county);
  }

  lines.push("");
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
    const parsed = parseSubjectAndBody(rawText);
    const subject = parsed.subject;
    let emailBody = enforceCountySignoff(parsed.body, scenario.county);
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
