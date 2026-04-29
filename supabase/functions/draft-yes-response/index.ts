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
  "You are Brad Hemminger replying to a local business owner who said yes. First person always. Under 200 words. Warm confident not salesy. Price is flat 500 dollars complete no hidden fees. Fully built and live within 48 hours or completely free no questions asked. Tell them I am putting their free mock together right now. Include this line naturally: Here is your free preview — then the mock URL on its own line. Ask only — do they have a logo or photos, and have they seen any websites they like. Sign off — Brad Hemminger then county name and the word County. End with: Reply STOP anytime — no hard feelings.";

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
