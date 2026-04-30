// Activates or pauses the Pipedream reply pipeline workflow.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { active } = await req.json();
    const url = Deno.env.get("PIPEDREAM_WEBHOOK_URL");
    if (!url) throw new Error("PIPEDREAM_WEBHOOK_URL not configured");
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: active ? "activate" : "pause", active: !!active }),
    });
    return new Response(JSON.stringify({ success: res.ok, status: res.status }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: String(e) }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
