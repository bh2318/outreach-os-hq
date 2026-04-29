// Draft Brad's YES-response email via Claude using the spec prompt.
// Returns { success, draft, subject, model }.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CLAUDE_MODELS = [
  "claude-haiku-3-5-20251001",
  "claude-haiku-4-5-20251001",
  "claude-sonnet-4-5-20250929",
];

const SYSTEM_PROMPT =
  "You are Brad Hemminger replying to a local business owner who just said yes. Warm, confident, already moving. First person throughout. Use this structure exactly. Opening: Hey followed by their first name if known otherwise Hey, then: appreciate you getting back to me. Paragraph two: I am already getting started on your free mock website. This part of the process can have as much or as little input from you as you would like — totally up to you. Paragraph three: If you have a logo, any photos of your work, or even just examples of websites you like the look of — from any industry — send them my way. Anything you can share helps me bring your vision to life. Everything else I can fill in using your public information and my own creative input. Closing line exactly: Soon as you get back to me I will get everything wrapped up and sent over so we can go from there. Sign off: Brad Hemminger on one line, their county name followed by County on the next line. Final line exactly: Reply STOP anytime — no hard feelings. Never mention price. Never mention 48 hours. Never mention service contract. Short sentences. Plain words. Never eager.";

function buildUserMessage(vars: {
  business_name: string;
  city: string;
  state: string;
  county: string;
  niche: string;
  review_count: number | string;
  rating: number | string;
  mock_url: string;
}) {
  return [
    `business_name: ${vars.business_name}`,
    `city: ${vars.city}`,
    `state: ${vars.state}`,
    `county: ${vars.county}`,
    `niche: ${vars.niche}`,
    `review_count: ${vars.review_count}`,
    `rating: ${vars.rating}`,
    `mock_url: ${vars.mock_url}`,
  ].join("\n");
}

function ensureCountySuffix(county: string): string {
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
        max_tokens: 300,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      }),
    });
    if (res.ok) {
      const d = await res.json();
      const text: string =
        d?.content?.map((c: { text?: string }) => c.text || "").join("\n").trim() || "";
      return { text, model };
    }
    const t = await res.text();
    errs.push(`${model}: ${res.status} ${t}`);
    if (![400, 404].includes(res.status)) break;
  }
  throw new Error(`Claude unavailable. Tried: ${errs.join(" | ")}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const ANTHROPIC = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC) throw new Error("ANTHROPIC_API_KEY not configured");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const { leadId, mockUrl: mockUrlIn } = await req.json();
    if (!leadId) throw new Error("leadId required");

    const { data: lead, error } = await supabase
      .from("leads")
      .select("id,business_name,city,state,county,niche,site_audit_json")
      .eq("id", leadId)
      .single();
    if (error || !lead) throw new Error(`Lead not found: ${error?.message}`);

    let mockUrl: string | null = mockUrlIn ?? null;
    if (!mockUrl) {
      const { data: latest } = await supabase
        .from("mock_sites")
        .select("preview_url")
        .eq("lead_id", leadId)
        .order("requested_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      mockUrl = latest?.preview_url ?? null;
    }

    const reviewCount = lead.site_audit_json?.review_count ?? "many";
    const rating = lead.site_audit_json?.rating ?? "5.0";
    const fullCounty = ensureCountySuffix(lead.county || lead.city || "");

    const userMessage = buildUserMessage({
      business_name: lead.business_name,
      city: lead.city ?? "",
      state: lead.state ?? "",
      county: fullCounty,
      niche: lead.niche ?? "",
      review_count: reviewCount,
      rating: rating,
      mock_url: mockUrl ?? "(mock site is being generated)",
    });

    const { text, model } = await draftWithClaude(ANTHROPIC, userMessage);

    return new Response(
      JSON.stringify({
        success: true,
        draft: text,
        subject: `Re: Your free site preview, ${lead.business_name}`,
        mockUrl,
        model,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("draft-yes-response error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
