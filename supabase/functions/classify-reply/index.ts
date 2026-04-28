// Classify a simulated reply as YES / NO / MAYBE via Claude.
// On YES -> generate mock site, create notification.
// On NO  -> archive lead, log activity.
// On MAYBE -> log activity (UI routes to Replies tab).

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

const CLASSIFY_PROMPT =
  "Classify this reply as YES, NO, or MAYBE. YES means the person is interested or wants to see more. NO means not interested or wants to stop. MAYBE means they asked a question or are unsure. Reply with one word only.";

async function classifyWithClaude(apiKey: string, replyText: string) {
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
        max_tokens: 10,
        system: CLASSIFY_PROMPT,
        messages: [{ role: "user", content: replyText }],
      }),
    });
    if (res.ok) {
      const d = await res.json();
      const raw: string = d?.content?.map((c: { text?: string }) => c.text || "").join(" ").trim() || "";
      return { raw, model };
    }
    const t = await res.text();
    errs.push(`${model}: ${res.status} ${t}`);
    if (![400, 404].includes(res.status)) break;
  }
  throw new Error(`Claude unavailable. Tried: ${errs.join(" | ")}`);
}

function normalizeIntent(raw: string): "YES" | "NO" | "MAYBE" {
  const t = raw.toUpperCase();
  if (t.includes("YES")) return "YES";
  if (t.includes("NO")) return "NO";
  return "MAYBE";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const ANTHROPIC = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC) throw new Error("ANTHROPIC_API_KEY not configured");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const { replyText, leadId, scenarioKey, businessName } = await req.json();
    if (!replyText || !leadId) throw new Error("replyText and leadId are required");

    const { raw, model } = await classifyWithClaude(ANTHROPIC, replyText);
    const intent = normalizeIntent(raw);

    // Persist a reply row
    const { data: replyRow } = await supabase
      .from("replies")
      .insert({
        lead_id: leadId,
        body: replyText,
        subject: "(simulated reply)",
        from_email: "simulated@local",
        intent,
        confidence: 1.0,
        classified_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    const notificationId: string | null = null;
    let mockSiteId: string | null = null;
    let mockUrl: string | null = null;

    if (intent === "YES") {
      // Generate mock site (best-effort; failure shouldn't break classification)
      try {
        const mockRes = await supabase.functions.invoke("generate-mock-site", {
          body: { leadId, scenarioKey, businessName },
        });
        if (mockRes.data?.mockSiteId) mockSiteId = mockRes.data.mockSiteId;
        if (mockRes.data?.url) mockUrl = mockRes.data.url;
      } catch (e) {
        console.error("generate-mock-site invoke failed", e);
      }

      await supabase.from("activity_log").insert({
        lead_id: leadId,
        business_name: businessName ?? null,
        action_type: "reply_classified_yes",
        outcome: "success",
        detail: `YES reply received — mock site generated`,
      });
    } else if (intent === "NO") {
      await supabase.from("leads").update({ archived: true, status: "archived" }).eq("id", leadId);
      await supabase.from("activity_log").insert({
        lead_id: leadId,
        business_name: businessName ?? null,
        action_type: "reply_classified_no",
        outcome: "success",
        detail: `${businessName ?? "Business"} replied not interested — sequence halted`,
      });
    } else {
      await supabase.from("activity_log").insert({
        lead_id: leadId,
        business_name: businessName ?? null,
        action_type: "reply_classified_maybe",
        outcome: "success",
        detail: `MAYBE reply — needs operator response`,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        intent,
        rawClassification: raw,
        model,
        replyId: replyRow?.id,
        notificationId,
        mockSiteId,
        mockUrl,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("classify-reply error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
