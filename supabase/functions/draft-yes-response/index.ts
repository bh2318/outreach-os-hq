// Draft Brad's YES-response email — fixed exact text, no LLM.
// Returns { success, draft, subject }.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const FIXED_BODY = `Hey, appreciate you getting back to me. I am already getting started on your free mock website and will have something over to you shortly worth looking at. In the meantime if you have a logo, any photos of your work, or websites you like the look of feel free to send them my way — anything helps. If not I have everything I need to put something solid together. Talk soon.

Brad Hemminger
Reply STOP anytime — no hard feelings`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const { leadId } = await req.json();
    if (!leadId) throw new Error("leadId required");

    const { data: lead, error } = await supabase
      .from("leads")
      .select("id,business_name")
      .eq("id", leadId)
      .single();
    if (error || !lead) throw new Error(`Lead not found: ${error?.message}`);

    return new Response(
      JSON.stringify({
        success: true,
        draft: FIXED_BODY,
        subject: `Re: Your free site preview, ${lead.business_name}`,
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
