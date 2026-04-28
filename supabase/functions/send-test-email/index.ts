// Edge function: send-test-email
// Generates one cold outreach email with Claude and sends via Resend.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SCENARIOS = [
  {
    key: "mikes-plumbing",
    name: "Mike's Plumbing",
    brief:
      "Mike's Plumbing in Tacoma, WA. No website at all. 47 Google reviews, 4.8 star average. Owner name unknown — address the business itself.",
  },
  {
    key: "green-thumb",
    name: "Green Thumb Landscaping",
    brief:
      "Green Thumb Landscaping in Olympia, WA. Owner is Sandra. They have a website but it scores 22/100. 31 Google reviews, 4.6 star average.",
  },
  {
    key: "peak-roofing",
    name: "Peak Roofing Co",
    brief:
      "Peak Roofing Co in Aberdeen, WA. Owner name unknown. Website scores 38/100. 12 Google reviews, 4.9 star average.",
  },
  {
    key: "bright-clean",
    name: "Bright Clean Services",
    brief:
      "Bright Clean Services in Centralia, WA. Owner is Maria. Website scores 14/100. 89 Google reviews, 4.7 star average.",
  },
  {
    key: "sunrise-hvac",
    name: "Sunrise HVAC",
    brief:
      "Sunrise HVAC in Hoquiam, WA. Owner is Dave. No website at all. 8 Google reviews, 5.0 star average.",
  },
];

const SYSTEM_PROMPT =
  "You write cold outreach emails for a web design service. Under 150 words. Open by genuinely complimenting the business — their reviews, rating, or trade reputation. Never use the words: outdated, old, bad, broken, slow, behind, losing, competitors. Frame any website gap as 'your online presence hasn't caught up with the quality of your work yet.' Mention a free no-strings mock website preview built for them. One CTA only: reply 'interested' or book a 10-minute call. Sign off as Bradford Hemminger from WA USA. End every email with: 'Reply STOP anytime — no hard feelings.' Plain words. Short sentences. Grade 6 reading level. Feels like a neighbor, not a marketer. Output subject line first then email body. Nothing else.";

const RECIPIENT = "b.hemminger18@gmail.com";
const FROM_ADDRESS = "Outreach OS <onboarding@resend.dev>";

function parseSubjectAndBody(text: string): { subject: string; body: string } {
  const cleaned = text.trim();
  const lines = cleaned.split(/\r?\n/);
  let subject = "";
  let bodyStart = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const m = line.match(/^subject\s*[:\-]\s*(.+)$/i);
    if (m) {
      subject = m[1].trim();
    } else {
      subject = line;
    }
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ANTHROPIC = Deno.env.get("ANTHROPIC_API_KEY");
    const RESEND = Deno.env.get("RESEND_API_KEY");
    if (!ANTHROPIC) throw new Error("ANTHROPIC_API_KEY not configured");
    if (!RESEND) throw new Error("RESEND_API_KEY not configured");

    const { index = 0 } = await req.json().catch(() => ({ index: 0 }));
    const scenario = SCENARIOS[index % SCENARIOS.length];

    // Call Claude
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-3-5-20251001",
        max_tokens: 250,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `Write the outreach email for this business:\n\n${scenario.brief}`,
          },
        ],
      }),
    });

    if (!claudeRes.ok) {
      const t = await claudeRes.text();
      throw new Error(`Claude error ${claudeRes.status}: ${t}`);
    }
    const claudeData = await claudeRes.json();
    const rawText: string =
      claudeData?.content?.map((c: any) => c.text || "").join("\n").trim() || "";

    const { subject, body } = parseSubjectAndBody(rawText);
    const fullEmail = `Subject: ${subject}\n\n${body}`;
    const wc = wordCount(body);

    // Send via Resend
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [RECIPIENT],
        subject: `[${scenario.name}] ${subject}`,
        text: body,
      }),
    });

    const resendData = await resendRes.json().catch(() => ({}));
    const delivered = resendRes.ok;

    return new Response(
      JSON.stringify({
        success: true,
        delivered,
        scenario: scenario.name,
        scenarioKey: scenario.key,
        subject,
        body,
        fullEmail,
        wordCount: wc,
        timestamp: new Date().toISOString(),
        resend: resendData,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
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
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
