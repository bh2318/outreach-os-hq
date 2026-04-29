// Draft Brad's MAYBE-reply response via Claude.
// Body: { leadId, replyText } -> { success, draft, subject, model }

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
  "You are Brad Hemminger replying to a local business owner who responded to your cold outreach with a question or some hesitation — not a clear yes, not a no. Confident, warm, nonchalant. Like a skilled tradesperson who has answered this exact question many times. First person throughout. Never eager, never pushy, never salesy. Output subject line on line one, blank line, then email body. Nothing else. Under 130 words total. Subject line is exactly: Re: followed by their original subject if provided, otherwise their business name. First short paragraph — answer the specific question they asked in plain language. If they did not ask a question, address the hesitation directly in one calm sentence. Second short paragraph — restate the offer simply: a free mock website built for their business, flat 500 dollars to keep it, live within 48 hours of receiving what you need or it is completely free. One closing sentence: just say the word and you will put the mock together and send it over. Sign off — line one: Brad Hemminger — line two: their county name followed by County — line three: Reply STOP anytime — no hard feelings. Never use: I appreciate, thank you for getting back, excited, thrilled, amazing, transform, solution, no problem at all, totally understand. Short sentences, plain words, grade 6 reading level.";

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
        max_tokens: 350,
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

    const { leadId, replyText } = await req.json();
    if (!leadId) throw new Error("leadId required");

    const { data: lead, error } = await supabase
      .from("leads")
      .select("id,business_name,city,state,county,niche")
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
      "",
      "Their reply:",
      (replyText ?? "").toString().slice(0, 2000),
      "",
      "Write the response now.",
    ].join("\n");

    const { text, model } = await draftWithClaude(ANTHROPIC, userMessage);
    const fallback = `Re: ${lead.business_name}`;
    const { subject, body } = splitSubjectBody(text, fallback);

    return new Response(
      JSON.stringify({ success: true, draft: body, subject, model }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("draft-maybe-response error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
