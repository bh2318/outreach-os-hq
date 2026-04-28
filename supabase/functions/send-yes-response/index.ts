// Send the YES response (with mock site URL appended), update lead, mock_sites, notification, log activity.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const RECIPIENT = "b.hemminger18@gmail.com"; // test inbox
const FROM_ADDRESS = "Outreach OS <onboarding@resend.dev>";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const RESEND = Deno.env.get("RESEND_API_KEY");
    if (!RESEND) throw new Error("RESEND_API_KEY not configured");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const { leadId, notificationId, mockSiteId, draft, subject } = await req.json();
    if (!leadId || !draft) throw new Error("leadId and draft required");

    // Fetch lead + mock URL
    const { data: lead } = await supabase
      .from("leads")
      .select("id,business_name")
      .eq("id", leadId)
      .single();
    let mockUrl: string | null = null;
    if (mockSiteId) {
      const { data: m } = await supabase.from("mock_sites").select("preview_url").eq("id", mockSiteId).single();
      mockUrl = m?.preview_url ?? null;
    }
    if (!mockUrl) {
      const { data: latest } = await supabase
        .from("mock_sites")
        .select("preview_url")
        .eq("lead_id", leadId)
        .order("requested_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      mockUrl = latest?.preview_url ?? null;
    }

    const finalBody = mockUrl
      ? `${draft}\n\nHere's your free mock preview: ${mockUrl}`
      : draft;

    const finalSubject = subject || `Re: Your new site, ${lead?.business_name ?? "your business"}`;

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [RECIPIENT],
        subject: `[${lead?.business_name ?? "Lead"}] ${finalSubject}`,
        text: finalBody,
      }),
    });
    const resendData = await resendRes.json().catch(() => ({}));
    const delivered = resendRes.ok;
    if (!delivered) throw new Error(`Resend failed: ${JSON.stringify(resendData)}`);

    // Persist outreach email
    await supabase.from("outreach_emails").insert({
      lead_id: leadId,
      subject: finalSubject,
      body: finalBody,
      sent_at: new Date().toISOString(),
      status: "sent",
      sequence_number: 99,
    });

    // Update lead status
    await supabase.from("leads").update({ status: "mock_sent", last_contacted: new Date().toISOString() }).eq("id", leadId);

    // Mock_sites status
    if (mockSiteId) {
      await supabase.from("mock_sites").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", mockSiteId);
    }

    // Mark notification acted
    if (notificationId) {
      await supabase.from("notifications").update({ status: "acted", acted_at: new Date().toISOString(), read: true, acted_on: true }).eq("id", notificationId);
    }

    // Activity log
    await supabase.from("activity_log").insert({
      lead_id: leadId,
      business_name: lead?.business_name ?? null,
      action_type: "yes_response_sent",
      outcome: "success",
      detail: `YES response + mock site sent`,
    });

    return new Response(
      JSON.stringify({ success: true, delivered, mockUrl }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("send-yes-response error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
