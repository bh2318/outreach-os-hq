// receive-reply
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CLASSIFY_PROMPT =
  "Classify this email reply as YES NO or MAYBE. YES means the person is interested or wants to see more. NO means not interested or wants to stop. MAYBE means they asked a question or are unsure. Reply with one word only.";

const YES_FIXED_BODY = `Hey, appreciate you getting back to me. I am already getting started on your free mock website and will have something over to you shortly worth looking at. In the meantime if you have a logo, any photos of your work, or websites you like the look of feel free to send them my way — anything helps. If not I have everything I need to put something solid together. Talk soon.

Brad Hemminger
Reply STOP anytime — no hard feelings`;

const MAYBE_DRAFT_PROMPT =
  "You are Brad Hemminger replying to a local business owner who replied with a question or hesitation. Warm, confident, no pressure. First person. Two short paragraphs maximum. Answer their question directly and plainly. End with: Reply STOP anytime — no hard feelings. Sign off: Brad Hemminger on one line, then exactly: Reply STOP anytime — no hard feelings. Do NOT include a county line. Do NOT include any location line. Never mention price. Never eager. Plain words.";

async function draftReplyWithClaude(apiKey: string, system: string, user: string): Promise<string> {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 400,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!res.ok) return "";
    const d = await res.json();
    return (d?.content?.[0]?.text ?? "").trim();
  } catch {
    return "";
  }
}

const GOAL_PROMPT =
  "Read this email reply from a small business owner. Extract a single concise sentence describing what they said they want their website to do for their business — for example get more calls, book appointments, show photos of past work, sell products, look more professional. Reply with ONLY that one sentence — no preamble, no quotes. If they did not mention any goal at all, reply with the single word NONE.";

async function extractGoalWithClaude(apiKey: string, replyText: string): Promise<string | null> {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 120,
        system: GOAL_PROMPT,
        messages: [{ role: "user", content: replyText }],
      }),
    });
    if (!res.ok) return null;
    const d = await res.json();
    const text = (d?.content?.[0]?.text ?? "").trim();
    if (!text || text.toUpperCase() === "NONE") return null;
    return text.replace(/^["']|["']$/g, "");
  } catch {
    return null;
  }
}

function extractImageUrls(text: string): string[] {
  if (!text) return [];
  const urlRe = /https?:\/\/[^\s<>"')]+/gi;
  const found = text.match(urlRe) ?? [];
  const imgExt = /\.(jpe?g|png|gif|webp|bmp|tiff?)(\?[^\s]*)?$/i;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of found) {
    const cleaned = u.replace(/[).,;]+$/, "");
    if (imgExt.test(cleaned) && !seen.has(cleaned)) {
      seen.add(cleaned);
      out.push(cleaned);
    }
  }
  return out.slice(0, 12);
}

function ok(body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function extractEmailAddress(value: string | undefined | null): string | null {
  if (!value) return null;
  const m = value.match(/<([^>]+)>/);
  const candidate = (m ? m[1] : value).trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate) ? candidate : null;
}

function stripHtml(s: string): string {
  return s
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function parseRawEmail(raw: string): { from: string | null; subject: string | null; body: string } {
  const normalized = raw.replace(/\r\n/g, "\n");
  const idx = normalized.indexOf("\n\n");
  const headerBlock = idx === -1 ? normalized : normalized.slice(0, idx);
  let body = idx === -1 ? "" : normalized.slice(idx + 2);
  const headerLines: string[] = [];
  for (const line of headerBlock.split("\n")) {
    if (/^[ \t]/.test(line) && headerLines.length > 0) {
      headerLines[headerLines.length - 1] += " " + line.trim();
    } else {
      headerLines.push(line);
    }
  }
  const headers: Record<string, string> = {};
  for (const line of headerLines) {
    const m = line.match(/^([A-Za-z-]+):\s*(.*)$/);
    if (m) headers[m[1].toLowerCase()] = m[2];
  }
  body = stripHtml(body);
  return {
    from: extractEmailAddress(headers["from"]),
    subject: headers["subject"] ?? null,
    body: body.trim() || stripHtml(raw),
  };
}

async function extractFromRequest(req: Request): Promise<{ from: string | null; subject: string | null; body: string }> {
  const ct = (req.headers.get("content-type") || "").toLowerCase();
  const text = await req.text();
  if (ct.includes("application/json")) {
    try {
      const j = JSON.parse(text);
      const from =
        extractEmailAddress(j.from) ||
        extractEmailAddress(j.sender) ||
        extractEmailAddress(j.from_email) ||
        extractEmailAddress(j.email) ||
        null;
      const subject = j.subject ?? j.Subject ?? null;
      const body = j.body ?? j.text ?? j.body_text ?? j.message ?? j.content ?? j["body-plain"] ?? "";
      if (from || subject || body) return { from, subject, body: String(body) };
    } catch {
      // fall through
    }
  }
  return parseRawEmail(text);
}

async function classifyWithClaude(apiKey: string, replyText: string): Promise<"YES" | "NO" | "MAYBE"> {
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
  return raw.includes("YES") ? "YES" : raw.includes("NO") ? "NO" : "MAYBE";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return ok({ status: "ignored", reason: "method not allowed" });

  try {
    const { from, subject, body } = await extractFromRequest(req);
    if (!from) return ok({ status: "success", message: "no sender extracted" });

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANTHROPIC = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC) return ok({ status: "success", message: "anthropic key missing" });
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const TEST_INBOX = "b.h.weboutreach@gmail.com";
    let lead: { id: string; business_name: string; email: string | null } | null = null;

    if (from === TEST_INBOX) {
      const { data: lastSent } = await supabase
        .from("outreach_emails")
        .select("lead_id, sent_at")
        .not("lead_id", "is", null)
        .order("sent_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      if (lastSent?.lead_id) {
        const { data: l } = await supabase
          .from("leads")
          .select("id, business_name, email")
          .eq("id", lastSent.lead_id)
          .maybeSingle();
        lead = l ?? null;
      }
    } else {
      const { data: l } = await supabase
        .from("leads")
        .select("id, business_name, email")
        .ilike("email", from)
        .maybeSingle();
      lead = l ?? null;
    }

    if (!lead) return ok({ status: "success", message: "no matching lead found", sender: from });

    const now = new Date().toISOString();

    // Duplicate reply protection
    const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recentDup } = await supabase
      .from("replies")
      .select("id, body")
      .eq("lead_id", lead.id)
      .ilike("from_email", from)
      .gte("received_at", cutoff24h)
      .order("received_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (recentDup?.id) {
      const appended = `${recentDup.body ?? ""}\n\n--- Follow-up message received ${now} ---\n${body}`;
      await supabase.from("replies").update({ body: appended }).eq("id", recentDup.id);
      await supabase.from("activity_log").insert({
        action_type: "reply_received",
        business_name: lead.business_name,
        lead_id: lead.id,
        detail: "Follow-up message appended to existing reply (within 24h)",
        outcome: "success",
      });
      return ok({ status: "success", classification: "DUPLICATE_APPENDED", lead_id: lead.id });
    }

    // Reply time calculation
    let replyMinutes: number | null = null;
    {
      const { data: lastSent } = await supabase
        .from("outreach_emails")
        .select("sent_at")
        .eq("lead_id", lead.id)
        .not("sent_at", "is", null)
        .order("sent_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lastSent?.sent_at) {
        replyMinutes = Math.max(0, Math.round((Date.now() - new Date(lastSent.sent_at).getTime()) / 60000));
      }
    }

    const trimmedBody = (body || "").trim();

    // STOP detection
    const isStop = /\bstop\b/i.test(trimmedBody) && trimmedBody.length < 80;
    if (isStop) {
      await supabase.from("unsubscribed").upsert(
        { email: from, lead_id: lead.id, reason: "replied STOP" },
        { onConflict: "email" },
      );
      await supabase.from("leads").update({ status: "unsubscribed" }).eq("id", lead.id);
      await supabase.from("replies").insert({
        lead_id: lead.id,
        from_email: from,
        subject: subject ?? "",
        body,
        received_at: now,
        intent: "unsubscribe",
        classified_at: now,
        confidence: 1.0,
        actioned: true,
        reply_time_minutes: replyMinutes,
      });
      await supabase.from("activity_log").insert({
        action_type: "reply_received",
        business_name: lead.business_name,
        lead_id: lead.id,
        detail: "lead replied STOP — added to unsubscribed blacklist",
        outcome: "warning",
      });
      return ok({ status: "success", classification: "STOP", lead_id: lead.id });
    }

    // Signed agreement detection
    const lowerBody = trimmedBody.toLowerCase();
    const looksLikeAgreement =
      /(signed|signature|agreement|contract)/.test(lowerBody) &&
      /(attached|enclosed|here|sending|sent|back)/.test(lowerBody);
    if (looksLikeAgreement) {
      const { data: existingDeal } = await supabase
        .from("deals")
        .select("id")
        .eq("lead_id", lead.id)
        .order("stage_entered_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existingDeal?.id) {
        await supabase
          .from("deals")
          .update({ stage: "agreement_received", stage_entered_at: now })
          .eq("id", existingDeal.id);
      } else {
        await supabase.from("deals").insert({
          lead_id: lead.id,
          stage: "agreement_received",
          stage_entered_at: now,
        });
      }
      await supabase.from("replies").insert({
        lead_id: lead.id,
        from_email: from,
        subject: subject ?? "",
        body,
        received_at: now,
        intent: "interested",
        classified_at: now,
        confidence: 0.95,
        actioned: false,
        reply_time_minutes: replyMinutes,
      });
      await supabase.from("activity_log").insert({
        action_type: "deal_updated",
        business_name: lead.business_name,
        lead_id: lead.id,
        detail: "signed agreement received — pipeline advanced to Agreement Received",
        outcome: "success",
      });
      return ok({ status: "success", classification: "AGREEMENT", lead_id: lead.id });
    }

    // Classify
    let classification: "YES" | "NO" | "MAYBE";
    try {
      classification = await classifyWithClaude(ANTHROPIC, body);
    } catch (e) {
      return ok({ status: "success", message: "classification failed", error: String(e) });
    }

    const { data: leadFull } = await supabase
      .from("leads")
      .select("id,business_name,owner_name,city,state,niche,rating,review_count")
      .eq("id", lead.id)
      .maybeSingle();

    const leadContext = [
      `business_name: ${leadFull?.business_name ?? lead.business_name}`,
      `owner_name: ${leadFull?.owner_name ?? ""}`,
      `niche: ${leadFull?.niche ?? ""}`,
      `city: ${leadFull?.city ?? ""}`,
      `state: ${leadFull?.state ?? ""}`,
      "",
      `their_reply: ${body}`,
      "",
      "Write the reply email now.",
    ].join("\n");

    if (classification === "YES") {
      // Notify operator
      try {
        const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
        const RESEND_FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL");
        if (RESEND_API_KEY && RESEND_FROM_EMAIL) {
          const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              from: `Brad Hemminger <${RESEND_FROM_EMAIL}>`,
              to: ["b.hemminger18@gmail.com"],
              subject: "Outreach OS — New reply waiting for you",
              text: `${lead.business_name}\n\n${body}`,
              html: `<p>${escHtml(lead.business_name)}</p><pre style="font-family:inherit;white-space:pre-wrap;margin:0">${escHtml(body)}</pre>`,
            }),
          });
        }
      } catch (e) {
        console.error("[receive-reply] operator notify error", e);
      }

      const draftSubject = subject ? `Re: ${subject.replace(/^re:\s*/i, "")}` : `Re: ${lead.business_name}`;

      // Insert notification with only real columns
      await supabase.from("notifications").insert({
        lead_id: lead.id,
        type: "yes_reply",
        message: `${lead.business_name} replied YES — mock requested`,
        read: false,
        created_at: now,
      });

      // Insert reply with only real columns
      await supabase.from("replies").insert({
        lead_id: lead.id,
        from_email: from,
        subject: subject ?? "",
        body,
        received_at: now,
        intent: "interested",
        classified_at: now,
        confidence: 0.95,
        actioned: false,
        draft_response: YES_FIXED_BODY,
        reply_time_minutes: replyMinutes,
      });

      const websiteGoal = await extractGoalWithClaude(ANTHROPIC, body);
      const clientAssetUrls = extractImageUrls(body);
      const clientAssets = clientAssetUrls.map((u) => ({ url: u, source: "client_reply" }));

      await supabase
        .from("leads")
        .update({
          status: "mock-requested",
          website_goal: websiteGoal,
          client_assets: clientAssets,
        })
        .eq("id", lead.id);

      await supabase.from("mock_sites").insert({
        lead_id: lead.id,
        status: "not-generated",
        requested_at: now,
      });

      await supabase.from("activity_log").insert({
        action_type: "reply_received",
        business_name: lead.business_name,
        lead_id: lead.id,
        detail: "lead replied YES — moved to Mock Studio",
        outcome: "success",
      });

    } else if (classification === "NO") {
      await supabase.from("leads").update({ status: "archived" }).eq("id", lead.id);
      await supabase.from("replies").insert({
        lead_id: lead.id,
        from_email: from,
        subject: subject ?? "",
        body,
        received_at: now,
        intent: "not_interested",
        classified_at: now,
        confidence: 0.95,
        actioned: true,
        reply_time_minutes: replyMinutes,
      });
      await supabase.from("activity_log").insert({
        action_type: "reply_received",
        business_name: lead.business_name,
        lead_id: lead.id,
        detail: "lead replied not interested — sequence halted",
        outcome: "success",
      });

    } else {
      const draft = await draftReplyWithClaude(ANTHROPIC, MAYBE_DRAFT_PROMPT, leadContext);
      const draftSubject = subject ? `Re: ${subject.replace(/^re:\s*/i, "")}` : `Re: ${lead.business_name}`;
      await supabase.from("replies").insert({
        lead_id: lead.id,
        from_email: from,
        subject: subject ?? "",
        body,
        received_at: now,
        intent: "needs_response",
        classified_at: now,
        confidence: 0.7,
        actioned: false,
        draft_response: draft || null,
        reply_time_minutes: replyMinutes,
      });
      await supabase.from("activity_log").insert({
        action_type: "reply_received",
        business_name: lead.business_name,
        lead_id: lead.id,
        detail: "lead replied with question — draft pre-generated",
        outcome: "success",
      });
    }

    return ok({ status: "success", classification, lead_id: lead.id, business_name: lead.business_name });
  } catch (e) {
    console.error("[receive-reply] fatal", e);
    return ok({ status: "success", message: "handled with error", error: String(e) });
  }
});
