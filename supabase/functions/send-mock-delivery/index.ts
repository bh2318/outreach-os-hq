// send-mock-delivery
// Emails the generated mock URL + service agreement PDF to the lead.
// Updates lead/mock/deal status and writes activity log.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { jsPDF } from "https://esm.sh/jspdf@2.5.1";

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

function buildEmailHtml(bodyText: string, previewUrl: string, businessName: string): string {
  const safeBody = escapeHtml(bodyText).replace(/\n/g, "<br>");
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f6f6f6;font-family:Arial,Helvetica,sans-serif;color:#1a1a2e">
<div style="max-width:560px;margin:24px auto;background:#fff;border-radius:10px;padding:28px 24px;box-shadow:0 2px 12px rgba(0,0,0,.06)">
  <div style="font-size:15px;line-height:1.6;color:#222">${safeBody}</div>
  <div style="text-align:center;margin:28px 0 8px">
    <a href="${escapeHtml(previewUrl)}" style="display:inline-block;background:#534AB7;color:#fff;text-decoration:none;font-weight:600;font-size:16px;padding:14px 28px;border-radius:8px">View your mock website</a>
  </div>
  <div style="font-size:12px;color:#666;text-align:center;margin-top:6px;word-break:break-all">${escapeHtml(previewUrl)}</div>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0" />
  <div style="font-size:11px;color:#888;text-align:center">Sent from Brad Hemminger about ${escapeHtml(businessName)}</div>
</div>
</body></html>`;
}

function buildAgreementPdfBase64(agreementText: string, businessName: string): string {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 56;
  const maxWidth = pageWidth - margin * 2;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Service Agreement", margin, 72);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(`Client: ${businessName}`, margin, 100);
  doc.text(`Date: ${new Date().toLocaleDateString("en-US")}`, margin, 116);

  doc.setLineWidth(0.5);
  doc.line(margin, 128, pageWidth - margin, 128);

  doc.setFontSize(11);
  const lines = doc.splitTextToSize(agreementText || "", maxWidth);
  let y = 148;
  const lineHeight = 15;
  const pageHeight = doc.internal.pageSize.getHeight();
  for (const line of lines) {
    if (y > pageHeight - margin) {
      doc.addPage();
      y = 72;
    }
    doc.text(String(line), margin, y);
    y += lineHeight;
  }

  // Output as base64 (no data URI prefix)
  const dataUri = doc.output("datauristring");
  return dataUri.split(",")[1] ?? "";
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

    const html = buildEmailHtml(emailBody, previewUrl, lead.business_name);
    const pdfBase64 = buildAgreementPdfBase64(agreement, lead.business_name);

    const resendPayload: any = {
      from: `Brad Hemminger <${RESEND_FROM_EMAIL}>`,
      to: [lead.email],
      subject,
      html,
      text: `${emailBody}\n\nMock preview: ${previewUrl}`,
    };
    if (pdfBase64) {
      resendPayload.attachments = [
        {
          filename: `Service-Agreement-${lead.business_name.replace(/[^A-Za-z0-9]+/g, "-")}.pdf`,
          content: pdfBase64,
        },
      ];
    }

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
        outcome: "failure",
      });
      return new Response(JSON.stringify({ error: "resend failed", detail: t }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const nowIso = new Date().toISOString();

    // Update lead + mock + deal
    await supabase.from("leads").update({ status: "mock-sent" }).eq("id", leadId);
    if (mock?.id) {
      await supabase.from("mock_sites").update({ status: "sent", sent_at: nowIso }).eq("id", mock.id);
    }
    // Upsert a deal record at "Proposal Sent"
    const { data: existingDeal } = await supabase
      .from("deals")
      .select("id")
      .eq("lead_id", leadId)
      .maybeSingle();
    if (existingDeal?.id) {
      await supabase
        .from("deals")
        .update({ stage: "Proposal Sent", stage_entered_at: nowIso })
        .eq("id", existingDeal.id);
    } else {
      await supabase.from("deals").insert({
        lead_id: leadId,
        stage: "Proposal Sent",
        stage_entered_at: nowIso,
        estimated_value: 50000,
      });
    }

    await supabase.from("activity_log").insert({
      action_type: "mock_sent",
      business_name: lead.business_name,
      lead_id: leadId,
      detail: `Mock + agreement emailed to ${lead.email}`,
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
