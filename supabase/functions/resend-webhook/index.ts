// resend-webhook
// Public webhook for Resend events: email.opened, email.bounced, email.complained.
// Updates lead status + logs activity. Resend does not include auth headers,
// so this endpoint is intentionally unauthenticated and always returns 200.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, svix-id, svix-timestamp, svix-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function ok(b: Record<string, unknown>) {
  return new Response(JSON.stringify(b), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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
    const headersIn = data?.headers ?? {};
    let leadId: string | null = null;
    if (Array.isArray(headersIn)) {
      const lh = headersIn.find((h: any) => (h?.name ?? "").toLowerCase() === "x-lead-id");
      leadId = lh?.value ?? null;
    } else if (typeof headersIn === "object" && headersIn !== null) {
      leadId = headersIn["X-Lead-Id"] ?? headersIn["x-lead-id"] ?? null;
    }
    const messageId: string | undefined = data?.email_id ?? data?.id;

    // Resolve lead by id or recipient email
    let lead: { id: string; business_name: string } | null = null;
    if (leadId) {
      const { data: l } = await supabase.from("leads").select("id, business_name").eq("id", leadId).maybeSingle();
      lead = l ?? null;
    }
    if (!lead && recipient) {
      const { data: l } = await supabase.from("leads").select("id, business_name").ilike("email", recipient).maybeSingle();
      lead = l ?? null;
    }

    await supabase.from("email_events").insert({
      lead_id: lead?.id ?? null,
      email: recipient ?? null,
      event_type: eventType,
      resend_message_id: messageId ?? null,
      payload: body,
    });

    if (eventType === "email.opened" && lead) {
      await supabase
        .from("leads")
        .update({ status: "email-opened", email_opened_at: new Date().toISOString() })
        .eq("id", lead.id);
      await supabase.from("activity_log").insert({
        action_type: "emailed",
        business_name: lead.business_name,
        lead_id: lead.id,
        detail: `${lead.business_name} opened your email — no reply yet`,
        outcome: "success",
      });
    } else if (eventType === "email.bounced" && lead) {
      await supabase.from("activity_log").insert({
        action_type: "system",
        business_name: lead.business_name,
        lead_id: lead.id,
        detail: `${lead.business_name} email bounced`,
        outcome: "failed",
      });
    } else if (eventType === "email.complained" && lead) {
      // Auto-pause outreach on spam complaint
      await supabase.from("settings").update({ outreach_active: false }).eq("id", 1);
      await supabase.from("activity_log").insert({
        action_type: "system",
        business_name: lead.business_name,
        lead_id: lead.id,
        detail: "System auto-paused — spam complaint received",
        outcome: "failed",
      });
    }

    return ok({ ok: true, eventType });
  } catch (e) {
    console.error("[resend-webhook] fatal", e);
    return ok({ ok: true, error: String(e) });
  }
});
