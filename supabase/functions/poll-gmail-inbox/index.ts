// poll-gmail-inbox
// Connects to Gmail via IMAP (using app password), reads UNSEEN emails,
// matches the sender to a lead, classifies the reply with Claude, and
// dispatches notifications / replies / activity_log writes accordingly.
// Marks the message as \\Seen on success so it isn't re-processed.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { ImapFlow } from "https://esm.sh/imapflow@1.0.164";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CLASSIFY_PROMPT =
  "Classify this email reply as YES NO or MAYBE. YES means the person is interested or wants to see more. NO means not interested or wants to stop. MAYBE means they asked a question or are unsure. Reply with one word only.";

function extractEmailAddress(from: string | undefined | null): string | null {
  if (!from) return null;
  const m = from.match(/<([^>]+)>/);
  const candidate = (m ? m[1] : from).trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate) ? candidate : null;
}

async function classifyWithClaude(apiKey: string, replyText: string): Promise<{ intent: "YES" | "NO" | "MAYBE"; raw: string }> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 10,
      system: CLASSIFY_PROMPT,
      messages: [{ role: "user", content: replyText }],
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Claude classify failed: ${res.status} ${t}`);
  }
  const d = await res.json();
  const raw: string = (d?.content?.[0]?.text || "").trim().toUpperCase();
  const intent: "YES" | "NO" | "MAYBE" =
    raw.includes("YES") ? "YES" : raw.includes("NO") ? "NO" : "MAYBE";
  return { intent, raw };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const summary = { processed: 0, yes: 0, no: 0, maybe: 0, unmatched: 0, errors: [] as string[] };

  try {
    const GMAIL_USER = Deno.env.get("GMAIL_USER");
    const GMAIL_APP_PASSWORD = Deno.env.get("GMAIL_APP_PASSWORD");
    const ANTHROPIC = Deno.env.get("ANTHROPIC_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!GMAIL_USER) throw new Error("GMAIL_USER not configured");
    if (!GMAIL_APP_PASSWORD) throw new Error("GMAIL_APP_PASSWORD not configured");
    if (!ANTHROPIC) throw new Error("ANTHROPIC_API_KEY not configured");

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const client = new ImapFlow({
      host: "imap.gmail.com",
      port: 993,
      secure: true,
      auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
      logger: false,
    });

    try {
      await client.connect();
      console.log(`[poll-gmail-inbox] IMAP connected as ${GMAIL_USER} to imap.gmail.com:993 (SSL)`);
    } catch (connErr) {
      const e = connErr as { code?: string; responseText?: string; message?: string };
      const errMsg = `IMAP connection failed for ${GMAIL_USER}@imap.gmail.com:993 — code=${e.code ?? "UNKNOWN"} response="${e.responseText ?? ""}" message="${e.message ?? String(connErr)}"`;
      console.error(`[poll-gmail-inbox] ${errMsg}`);
      throw new Error(errMsg);
    }

    const lock = await client.getMailboxLock("INBOX");
    try {
      // Fetch UNSEEN messages only
      for await (const msg of client.fetch({ seen: false }, { envelope: true, source: true, uid: true })) {
        try {
          const fromAddr = msg.envelope?.from?.[0];
          const senderEmail = extractEmailAddress(fromAddr?.address ?? null);
          const subjectLine = msg.envelope?.subject ?? "";
          console.log(`[poll-gmail-inbox] UNSEEN uid=${msg.uid} from="${fromAddr?.address ?? "unknown"}" subject="${subjectLine}"`);

          // Parse plain-text body from the raw RFC822 source.
          const rawSource = msg.source ? new TextDecoder().decode(msg.source) : "";
          // crude body extract: take everything after the first blank line
          const blankIdx = rawSource.indexOf("\r\n\r\n");
          const bodyRaw = blankIdx >= 0 ? rawSource.slice(blankIdx + 4) : rawSource;
          // Strip HTML tags if present, normalize whitespace
          const bodyText = bodyRaw
            .replace(/<style[\s\S]*?<\/style>/gi, "")
            .replace(/<script[\s\S]*?<\/script>/gi, "")
            .replace(/<[^>]+>/g, " ")
            .replace(/=\r?\n/g, "")
            .replace(/&nbsp;/gi, " ")
            .replace(/\s+\n/g, "\n")
            .trim()
            .slice(0, 4000);

          if (!senderEmail) {
            summary.unmatched++;
            await client.messageFlagsAdd(msg.uid, ["\\Seen"], { uid: true });
            continue;
          }

          // Match sender to a lead by email
          const { data: lead } = await supabase
            .from("leads")
            .select("id, business_name, email")
            .ilike("email", senderEmail)
            .maybeSingle();

          if (!lead) {
            summary.unmatched++;
            await client.messageFlagsAdd(msg.uid, ["\\Seen"], { uid: true });
            continue;
          }

          // Classify
          const { intent, raw } = await classifyWithClaude(ANTHROPIC, bodyText);
          summary.processed++;

          if (intent === "YES") {
            summary.yes++;
            await supabase.from("notifications").insert({
              type: "yes_reply",
              kind: "yes_reply",
              business_name: lead.business_name,
              reply_body: bodyText,
              reply_full: bodyText,
              reply_preview: bodyText.split(/\r?\n/)[0].slice(0, 240),
              lead_id: lead.id,
              read: false,
              acted_on: false,
              status: "unread",
            });
            await supabase.from("replies").insert({
              lead_id: lead.id,
              from_email: senderEmail,
              subject: subjectLine,
              body: bodyText,
              intent: "interested",
              classified_at: new Date().toISOString(),
              confidence: 1.0,
            });
            await supabase.from("activity_log").insert({
              lead_id: lead.id,
              business_name: lead.business_name,
              action_type: "reply_yes",
              outcome: "success",
              detail: `YES reply from ${senderEmail}`,
            });
          } else if (intent === "NO") {
            summary.no++;
            await supabase.from("leads").update({ status: "archived", archived: true }).eq("id", lead.id);
            await supabase.from("replies").insert({
              lead_id: lead.id,
              from_email: senderEmail,
              subject: subjectLine,
              body: bodyText,
              intent: "not_interested",
              classified_at: new Date().toISOString(),
              confidence: 1.0,
            });
            await supabase.from("activity_log").insert({
              lead_id: lead.id,
              business_name: lead.business_name,
              action_type: "reply_no",
              outcome: "success",
              detail: `NO reply from ${senderEmail} — lead archived`,
            });
          } else {
            summary.maybe++;
            await supabase.from("replies").insert({
              lead_id: lead.id,
              from_email: senderEmail,
              subject: subjectLine,
              body: bodyText,
              intent: "needs_response",
              classified_at: new Date().toISOString(),
              confidence: 0.5,
            });
            await supabase.from("activity_log").insert({
              lead_id: lead.id,
              business_name: lead.business_name,
              action_type: "reply_maybe",
              outcome: "success",
              detail: `MAYBE reply from ${senderEmail} — needs response (raw: ${raw})`,
            });
          }

          // Mark as read in Gmail
          await client.messageFlagsAdd(msg.uid, ["\\Seen"], { uid: true });
        } catch (innerErr) {
          summary.errors.push(innerErr instanceof Error ? innerErr.message : String(innerErr));
        }
      }
    } finally {
      lock.release();
      await client.logout().catch(() => {});
    }

    return new Response(
      JSON.stringify({ success: true, ...summary, timestamp: new Date().toISOString() }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("poll-gmail-inbox error:", err);
    return new Response(
      JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : String(err),
        ...summary,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
