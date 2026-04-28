// Draft (or regenerate) Brad's YES-response email via Claude.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CLAUDE_MODELS = [
  "claude-haiku-4-5-20251001",
  "claude-sonnet-4-5-20250929",
  "claude-opus-4-5-20251101",
];

function buildPrompt(lead: any): string {
  const reviewCount = lead.site_audit_json?.review_count ?? "many";
  const rating = lead.site_audit_json?.rating ?? "5.0";
  return `Write a reply email from Brad Hemminger to a local business owner who just said yes to learning more about a website. Under 200 words. Warm and confident not salesy. Tell them the price is a flat $500 complete. Tell them it will be fully built within 48 hours or it is completely free no questions asked. Tell them you are sending over a free mock of their site right now so they can see exactly what it could look like. Ask two questions only — do they have a logo or any photos of their work, and have they seen any websites they like the look of. Sign off as Brad Hemminger with their county. End with Reply STOP anytime no hard feelings.

Business details:
Name ${lead.business_name}
Owner ${lead.owner_name ?? "(unknown)"}
City ${lead.city ?? ""}
County ${lead.county ?? ""}
Niche ${lead.niche ?? ""}
Reviews ${reviewCount} at ${rating} stars.`;
}

async function draftWithClaude(apiKey: string, prompt: string) {
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
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (res.ok) {
      const d = await res.json();
      const text: string = d?.content?.map((c: any) => c.text || "").join("\n").trim() || "";
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

    const { leadId } = await req.json();
    if (!leadId) throw new Error("leadId required");

    const { data: lead, error } = await supabase
      .from("leads")
      .select("id,business_name,owner_name,city,state,county,niche,site_audit_json")
      .eq("id", leadId)
      .single();
    if (error || !lead) throw new Error(`Lead not found: ${error?.message}`);

    const prompt = buildPrompt(lead);
    const { text, model } = await draftWithClaude(ANTHROPIC, prompt);

    return new Response(
      JSON.stringify({
        success: true,
        draft: text,
        subject: `Re: Quick mock of your new site, ${lead.business_name}`,
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
