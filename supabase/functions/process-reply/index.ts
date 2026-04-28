// process-reply: reads unprocessed rows from incoming_replies,
// classifies each via Claude, and routes to YES / NO / MAYBE handling.

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
  "Classify this reply as YES NO or MAYBE. YES means interested or wants to see more. NO means not interested. MAYBE means asking a question or unsure. One word only.";

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
        d?.content?.map((c: any) => c.text || "").join(" ").trim() || "";
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

    // Pull all unprocessed replies, oldest first.
    const { data: pending, error: fetchErr } = await supabase
      .from("incoming_replies")
      .select("id, lead_id, reply_text")
      .eq("processed", false)
      .order("received_at", { ascending: true })
      .limit(50);
    if (fetchErr) throw fetchErr;

    const results: any[] = [];

    for (const row of pending ?? []) {
      try {
        const { raw, model } = await classifyWithClaude(ANTHROPIC, row.reply_text);
        const intent = normalizeIntent(raw);

        // Look up the lead for business + county context.
        let lead: any = null;
        if (row.lead_id) {
          const { data } = await supabase
            .from("leads")
            .select("id, business_name, county")
            .eq("id", row.lead_id)
            .maybeSingle();
          lead = data ?? null;
        }
        const businessName = lead?.business_name ?? "Unknown business";

        // Persist a `replies` row for the Replies tab + history.
        await supabase.from("replies").insert({
          lead_id: row.lead_id,
          body: row.reply_text,
          subject: "(inbound reply)",
          from_email: "inbound@local",
          intent,
          confidence: 1.0,
          classified_at: new Date().toISOString(),
        });

        if (intent === "YES") {
          const firstLine = row.reply_text.trim().split(/\r?\n/)[0].slice(0, 240);
          await supabase.from("notifications").insert({
            kind: "yes_reply",
            business_name: businessName,
            reply_preview: firstLine,
            reply_full: row.reply_text,
            lead_id: row.lead_id,
            status: "unread",
          });
          await supabase.from("activity_log").insert({
            lead_id: row.lead_id,
            business_name: businessName,
            action_type: "reply_classified_yes",
            outcome: "success",
            detail: "YES reply received",
          });
        } else if (intent === "NO") {
          if (row.lead_id) {
            await supabase
              .from("leads")
              .update({ archived: true, status: "archived" })
              .eq("id", row.lead_id);
          }
          await supabase.from("activity_log").insert({
            lead_id: row.lead_id,
            business_name: businessName,
            action_type: "reply_classified_no",
            outcome: "success",
            detail: `${businessName} replied not interested — lead archived`,
          });
        } else {
          await supabase.from("activity_log").insert({
            lead_id: row.lead_id,
            business_name: businessName,
            action_type: "reply_classified_maybe",
            outcome: "success",
            detail: "MAYBE reply — needs operator response",
          });
        }

        await supabase
          .from("incoming_replies")
          .update({ processed: true, classified_as: intent })
          .eq("id", row.id);

        results.push({ id: row.id, intent, model, businessName });
      } catch (e) {
        console.error("process-reply row failed", row.id, e);
        results.push({
          id: row.id,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return new Response(
      JSON.stringify({ success: true, processed: results.length, results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("process-reply error:", err);
    return new Response(
      JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
