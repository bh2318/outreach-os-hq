// send-mock-delivery
// Emails the generated mock URL + service agreement to the lead.
// Updates lead/mock/deal status and writes activity log.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function escapeHtml(s: string) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildEmailHtml(bodyText: string, previewUrl: string, businessName: string, agreementText: string): string {
  const safeBody = escapeHtml(bodyText).replace(/\n/g, "<br>");
  const safeAgreement = escapeHtml(agreementText).replace(/\n/g, "<br>");
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f6f6f6;font-family:Arial,Helvetica,sans-serif;color:#1a1a2e">
<div style="max-width:560px;margin:24px auto;background:#fff;border-radius:10px;padding:28px 24px;box-shadow:0 2px 12px rgba(0,0,0,.06)">
  <div style="font-size:15px;line-height:1.6;color:#222">${safeBody}</div>
  <div style="text-align:center;margin:28px 0 8px">
    <a href="${escapeHtml(previewUrl)}" style="display:inline-block;background:#534AB7;color:#fff;text-decoration:none;font-weight:600;font-size:16px;padding:14px 28px;border-radius:8px">View your mock website</a>
  </div>
  <div style="font-size:12px;color:#666;text-align:center;margin-top:6px;word-break:break-all">${escapeHtml(previewUrl)}</div>
  ${agreementText ? `
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0" />
  <div style="font-size:13px;font-weight:600;color:#333;margin-bottom:12px">Service Agreement</div>
  <div style="font-size:12px;line-height:1.7;color:#555;background:#f8f8f8;border-radius:8px;padding:16px">${safeAgreement}</div>
  ` : ""}
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0" />
  <div style="font-size:11px;color:#888;text-align:center">Sent from Brad Hemminger about ${escapeHtml(businessName)}</div>
</div>
</body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const leadId: string = body.lead_id;
    const subject: string = String(body.subject ?? "");
    const emailBody: string = String(body.email_body ?? "");
    const agreement: string = String(body.agreement ?? "");
    if (!leadId || !subject || !emailBody) {
      return new Response(JSON.stringify({ error: "lead_id, subject and email_body required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const RESEND_FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL");
    if (!RESEND_API_KEY || !RESEND_FROM_EMAIL) {
      return new Response(JSON.stringify({ error: "Resend env vars missing" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: lead, error: leadErr } = await supabase
      .from("leads")
      .select("id,business_name,email")
      .eq("id", leadId)
      .maybeSingle();
    if (leadErr || !lead) {
      return new Response(JSON.stringify({ error: "lead not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!lead.email) {
      return new Response(JSON.stringify({ error: "lead has no email address" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: mock } = await supabase
      .from("mock_sites")
      .select("id,preview_url")
      .eq("lead_id", leadId)
      .order("requested_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const previewUrl = mock?.preview_url ?? "";

    const html = buildEmailHtml(emailBody, previewUrl, lead.business_name, agreement);

    const resendPayload = {
      from: `Brad Hemminger <${RESEND_FROM_EMAIL}>`,
      to: [lead.email],
      reply_to: "weboutreach@bhsites.com",
      subject,
      html,
      text: `${emailBody}\n\nMock preview: ${previewUrl}${agreement ? `\n\n---SERVICE AGREEMENT---\n${agreement}` : ""}`,
    };

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(resendPayload),
    });
    if (!resendRes.ok) {
      const t = await resendRes.text();
      console.error("[send-mock-delivery] resend failed", resendRes.status, t);
      await supabase.from("activity_log").insert({
        action_type: "mock_sent",
        business_name: lead.business_name,
        lead_id: leadId,
        detail: `Resend send failed: ${t.slice(0, 500)}`,
        outcome: "failed",
      });
      return new Response(JSON.stringify({ error: "resend failed", detail: t }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const nowIso = new Date().toISOString();

    await supabase.from("leads").update({ status: "mock-sent" }).eq("id", leadId);
    if (mock?.id) {
      await supabase.from("mock_sites").update({ status: "sent", sent_at: nowIso }).eq("id", mock.id);
    }

    const { data: existingDeal } = await supabase
      .from("deals")
      .select("id")
      .eq("lead_id", leadId)
      .maybeSingle();
    if (existingDeal?.id) {
      await supabase
        .from("deals")
        .update({ stage: "proposal_sent", stage_entered_at: nowIso })
        .eq("id", existingDeal.id);
    } else {
      await supabase.from("deals").insert({
        lead_id: leadId,
        stage: "proposal_sent",
        stage_entered_at: nowIso,
        estimated_value: 50000,
      });
    }

    await supabase.from("activity_log").insert({
      action_type: "mock_sent",
      business_name: lead.business_name,
      lead_id: leadId,
      detail: `Mock + agreement emailed to ${lead.email} — deal moved to Proposal Sent`,
      outcome: "success",
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[send-mock-delivery] fatal", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
