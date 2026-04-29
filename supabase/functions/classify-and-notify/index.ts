// classify-and-notify
// Receives { replyText, businessName, leadId? }.
// Calls Claude (claude-haiku-3-5-20251001 with model fallbacks) to classify
// the reply as YES / NO / MAYBE. Routes accordingly:
//   YES   -> insert notifications row (type yes_reply)
//   NO    -> archive lead, write activity log
//   MAYBE -> write activity log (Replies tab needs_response chip)

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

const CLASSIFY_PROMPT =
  "Classify this reply as YES NO or MAYBE. YES means interested. NO means not interested. MAYBE means asking a question. One word only.";

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
      const raw: string =
        d?.content?.map((c: { text?: string }) => c.text || "").join(" ").trim() || "";
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
  if (/\bYES\b/.test(t)) return "YES";
  if (/\bNO\b/.test(t)) return "NO";
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

    const { replyText, businessName, leadId } = await req.json();
    if (!replyText) throw new Error("replyText required");

    const { raw, model } = await classifyWithClaude(ANTHROPIC, replyText);
    const intent = normalizeIntent(raw);

    let notificationId: string | null = null;

    const firstLine = replyText.trim().split(/\r?\n/)[0].slice(0, 240);

    // Always persist a replies row so it shows in the Replies tab
    await supabase.from("replies").insert({
      lead_id: leadId ?? null,
      body: replyText,
      subject: "(inbound reply)",
      from_email: "inbound@local",
      intent: intent === "YES" ? "interested" : intent === "NO" ? "not_interested" : "needs_response",
      confidence: 1.0,
      classified_at: new Date().toISOString(),
      actioned: intent === "NO",
    });

    // Insert a notification for every classification — drives the overlay flow.
    const notifKind =
      intent === "YES" ? "yes_reply" : intent === "NO" ? "no_reply" : "maybe_reply";
    const { data: notif, error: notifErr } = await supabase
      .from("notifications")
      .insert({
        type: notifKind,
        kind: notifKind,
        business_name: businessName ?? "Unknown",
        reply_body: replyText,
        reply_full: replyText,
        reply_preview: firstLine,
        read: false,
        acted_on: false,
        status: "unread",
        lead_id: leadId ?? null,
      })
      .select("id")
      .single();
    if (notifErr) throw new Error(`notification insert failed: ${notifErr.message}`);
    notificationId = notif?.id ?? null;

    if (intent === "NO" && leadId) {
      await supabase.from("leads").update({ archived: true, status: "archived" }).eq("id", leadId);
    }

    await supabase.from("activity_log").insert({
      lead_id: leadId ?? null,
      business_name: businessName ?? null,
      action_type:
        intent === "YES" ? "reply_classified_yes"
        : intent === "NO" ? "reply_classified_no"
        : "reply_classified_maybe",
      outcome: "success",
      detail:
        intent === "YES" ? "YES reply received"
        : intent === "NO" ? `${businessName ?? "Lead"} replied not interested — lead archived`
        : "MAYBE reply — needs operator response",
    });

    return new Response(
      JSON.stringify({ success: true, intent, raw, model, notificationId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("classify-and-notify error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
