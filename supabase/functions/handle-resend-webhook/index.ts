// handle-resend-webhook
// Receives bounce + complaint events from Resend. Updates lead status, logs to
// activity_log, adds complainants to the unsubscribed table, and auto-pauses the
// system if more than 3 complaints arrive in any rolling 7-day window. Sends
// a single alert email to the operator on auto-pause.
//
// Public endpoint (Resend cannot send auth headers). Always returns 200 to
// avoid Resend retry storms.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, svix-id, svix-timestamp, svix-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALERT_RECIPIENT = "b.hemminger18@gmail.com";

function ok(body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sendAlertEmail(subject: string, html: string) {
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  const FROM = Deno.env.get("RESEND_FROM_EMAIL") || "alerts@resend.dev";
  if (!RESEND_API_KEY) return;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: [ALERT_RECIPIENT],
        subject,
        html,
      }),
    });
  } catch (e) {
    console.error("[handle-resend-webhook] alert email failed", e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return ok({ ok: true, ignored: "method" });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const body = await req.json().catch(() => ({}));
    const eventType: string = body.type ?? body.event ?? "";
    const data = body.data ?? body;
    const recipient: string | undefined = Array.isArray(data?.to) ? data.to[0] : data?.to;

    // Resolve x-lead-id if Resend echoed the custom header
    const headersIn = data?.headers ?? {};
    let leadIdHeader: string | null = null;
    if (Array.isArray(headersIn)) {
      const lh = headersIn.find((h: any) => (h?.name ?? "").toLowerCase() === "x-lead-id");
      leadIdHeader = lh?.value ?? null;
    } else if (typeof headersIn === "object" && headersIn !== null) {
      leadIdHeader = headersIn["X-Lead-Id"] ?? headersIn["x-lead-id"] ?? null;
    }
    const messageId: string | undefined = data?.email_id ?? data?.id;

    let lead: { id: string; business_name: string; email: string | null } | null = null;
    if (leadIdHeader) {
      const { data: l } = await supabase
        .from("leads")
        .select("id, business_name, email")
        .eq("id", leadIdHeader)
        .maybeSingle();
      lead = l ?? null;
    }
    if (!lead && recipient) {
      const { data: l } = await supabase
        .from("leads")
        .select("id, business_name, email")
        .ilike("email", recipient)
        .maybeSingle();
      lead = l ?? null;
    }

    // Always record the event
    await supabase.from("email_events").insert({
      lead_id: lead?.id ?? null,
      email: recipient ?? null,
      event_type: eventType,
      resend_message_id: messageId ?? null,
      payload: body,
    });

    const isBounce = eventType === "email.bounced" || eventType === "bounce";
    const isComplaint =
      eventType === "email.complained" || eventType === "complaint" || eventType === "spam";

    if (isBounce) {
      if (lead) {
        await supabase.from("leads").update({ status: "bounced" }).eq("id", lead.id);
        await supabase.from("activity_log").insert({
          action_type: "system",
          business_name: lead.business_name,
          lead_id: lead.id,
          detail: `Email to ${recipient ?? lead.email ?? "lead"} bounced`,
          outcome: "failed",
        });
      } else if (recipient) {
        await supabase.from("activity_log").insert({
          action_type: "system",
          business_name: recipient,
          detail: `Email bounced for ${recipient}`,
          outcome: "failed",
        });
      }
      return ok({ ok: true, eventType, handled: "bounce" });
    }

    if (isComplaint) {
      if (lead) {
        await supabase.from("leads").update({ status: "complained" }).eq("id", lead.id);
        if (recipient || lead.email) {
          await supabase.from("unsubscribed").insert({
            email: (recipient || lead.email)!,
            lead_id: lead.id,
            reason: "spam_complaint",
          });
        }
        await supabase.from("activity_log").insert({
          action_type: "system",
          business_name: lead.business_name,
          lead_id: lead.id,
          detail: `Spam complaint received from ${recipient ?? lead.email ?? "recipient"}`,
          outcome: "failed",
        });
      } else if (recipient) {
        await supabase.from("unsubscribed").insert({
          email: recipient,
          reason: "spam_complaint",
        });
        await supabase.from("activity_log").insert({
          action_type: "system",
          business_name: recipient,
          detail: `Spam complaint received from ${recipient}`,
          outcome: "failed",
        });
      }

      // Count complaints in last 7 days
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { count } = await supabase
        .from("email_events")
        .select("id", { count: "exact", head: true })
        .in("event_type", ["email.complained", "complaint", "spam"])
        .gte("created_at", sevenDaysAgo);

      if ((count ?? 0) > 3) {
        // Check current outreach state — only fire alert + log once per pause
        const { data: settings } = await supabase
          .from("settings")
          .select("outreach_active, reply_pipeline_active")
          .eq("id", 1)
          .maybeSingle();
        if (settings?.outreach_active) {
          await supabase
            .from("settings")
            .update({ outreach_active: false })
            .eq("id", 1);
          await supabase.from("activity_log").insert({
            action_type: "system",
            business_name: "System",
            detail: `System auto-paused — ${count} spam complaints in last 7 days`,
            outcome: "failed",
          });
          await sendAlertEmail(
            "Outreach OS Alert — Spam complaints detected — system paused",
            `<p>Outreach OS detected <strong>${count}</strong> spam complaints in the last 7 days and has automatically paused the outreach system.</p>
             <p>Open the Settings tab to review deliverability and re-enable when ready.</p>`
          );
        }
      }
      return ok({ ok: true, eventType, handled: "complaint", complaints_7d: count ?? 0 });
    }

    return ok({ ok: true, eventType, handled: "ignored" });
  } catch (e) {
    console.error("[handle-resend-webhook] fatal", e);
    return ok({ ok: true, error: String(e) });
  }
});
