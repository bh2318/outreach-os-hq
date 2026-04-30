// Send a follow-up email via Resend, log to outreach_emails, bump outreach_count.
// Sandbox-safe: SENDING_ENABLED gate while no domain is verified.
// Body: { leadId, draft, subject }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SENDING_ENABLED = false; // flip to true once a Resend domain is verified
const REPLY_TO = "b.h.weboutreach@gmail.com";

function resolveOutreachEmail(email: string | null, websiteUrl: string | null): string | null {
  if (email && email.trim()) return email.trim();
  const url = (websiteUrl ?? "").trim();
  if (!url) return null;
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    const host = u.hostname.replace(/^www\./i, "");
    if (!host || !host.includes(".")) return null;
    return `contact@${host}`;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const RESEND = Deno.env.get("RESEND_API_KEY");
    if (!RESEND) throw new Error("RESEND_API_KEY not configured");
    const FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL");
    if (!FROM_EMAIL) throw new Error("RESEND_FROM_EMAIL not configured");
    const FROM_ADDRESS = `Brad Hemminger <${FROM_EMAIL}>`;
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const { leadId, draft, subject } = await req.json();
    if (!leadId || !draft) throw new Error("leadId and draft required");

    const { data: lead } = await supabase
      .from("leads")
      .select("id,business_name,outreach_count,email,website_url")
      .eq("id", leadId)
      .single();
    if (!lead) throw new Error("lead not found");

    // If this lead has any reply on file, never send a follow-up.
    const { count: replyCount } = await supabase
      .from("replies")
      .select("id", { count: "exact", head: true })
      .eq("lead_id", leadId);
    if ((replyCount ?? 0) > 0) {
      // Make sure they're out of the queue
      await supabase.from("followup_queue").update({ sent: true, sent_at: new Date().toISOString() })
        .eq("lead_id", leadId).eq("sent", false);
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "lead_replied", leadId }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const destEmail = resolveOutreachEmail((lead as any).email ?? null, (lead as any).website_url ?? null);
    if (!destEmail) {
      await supabase.from("leads").update({ status: "phone_only" }).eq("id", leadId);
      await supabase.from("activity_log").insert({
        action_type: "system",
        business_name: lead.business_name,
        lead_id: leadId,
        detail: `No email available for ${lead.business_name} — marked as phone-only`,
        outcome: "warning",
      });
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "phone_only", leadId }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const finalSubject = subject || `Following up — ${lead.business_name}`;
    const seq = (lead.outreach_count ?? 1) + 1;

    let delivered = false;
    if (SENDING_ENABLED) {
      const resendRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: FROM_ADDRESS,
          to: [destEmail],
          reply_to: REPLY_TO,
          subject: finalSubject,
          text: draft,
          tracking: { opens: true },
          headers: { "X-Lead-Id": leadId },
        }),
      });
      const data = await resendRes.json().catch(() => ({}));
      if (!resendRes.ok) throw new Error(`Resend failed: ${JSON.stringify(data)}`);
      delivered = true;
    }

    const now = new Date().toISOString();
    await supabase.from("outreach_emails").insert({
      lead_id: leadId,
      sequence_number: seq,
      subject: finalSubject,
      body: draft,
      status: SENDING_ENABLED ? "sent" : "queued",
      sent_at: SENDING_ENABLED ? now : null,
    });
    await supabase
      .from("leads")
      .update({ last_contacted: now, outreach_count: seq })
      .eq("id", leadId);
    await supabase.from("activity_log").insert({
      lead_id: leadId,
      business_name: lead.business_name,
      action_type: "followup_sent",
      outcome: SENDING_ENABLED ? "success" : "warning",
      detail: SENDING_ENABLED
        ? `follow-up #${seq} sent`
        : `follow-up #${seq} drafted (sending disabled until domain verified)`,
    });

    return new Response(
      JSON.stringify({ success: true, delivered, sequenceNumber: seq }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("send-followup error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
