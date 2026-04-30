// send-daily-summary
// Sends Brad a daily summary email at end of day with key metrics from the last 24h.
// SAFETY: SENDING_ENABLED is false until Resend domain is verified. While blocked,
// the function still computes and logs the summary to activity_log.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SENDING_ENABLED = false;
const TO_ADDRESS = "b.hemminger18@gmail.com";
const FROM_ADDRESS = `Brad Hemminger <${Deno.env.get("RESEND_FROM_EMAIL") ?? ""}>`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [
      { count: leadsAdded },
      { count: emailsSent },
      { count: repliesIn },
      { count: yesReplies },
      { count: maybeReplies },
      { count: noReplies },
      { count: callRequests },
      { data: dealsClosed },
    ] = await Promise.all([
      supabase.from("leads").select("id", { count: "exact", head: true }).gte("created_at", since),
      supabase.from("outreach_emails").select("id", { count: "exact", head: true }).gte("sent_at", since),
      supabase.from("replies").select("id", { count: "exact", head: true }).gte("received_at", since),
      supabase.from("replies").select("id", { count: "exact", head: true }).gte("received_at", since).eq("intent", "interested"),
      supabase.from("replies").select("id", { count: "exact", head: true }).gte("received_at", since).eq("intent", "price_inquiry"),
      supabase.from("replies").select("id", { count: "exact", head: true }).gte("received_at", since).eq("intent", "not_interested"),
      supabase.from("replies").select("id", { count: "exact", head: true }).gte("received_at", since).eq("intent", "call_request"),
      supabase.from("deals").select("actual_value, estimated_value, stage").gte("stage_entered_at", since).in("stage", ["won", "building", "delivered", "paid"]),
    ]);

    const revenue = (dealsClosed ?? []).reduce((s: number, d: any) => s + (d.actual_value ?? d.estimated_value ?? 0), 0);

    const today = new Date().toLocaleDateString("en-US", {
      weekday: "long", month: "long", day: "numeric", year: "numeric",
    });

    const subject = `Outreach OS daily summary — ${today}`;
    const body = `Hey Brad,

Here is your last 24 hours at a glance.

Leads added: ${leadsAdded ?? 0}
Emails sent: ${emailsSent ?? 0}
Replies received: ${repliesIn ?? 0}
  • Interested (YES): ${yesReplies ?? 0}
  • Maybe / questions: ${maybeReplies ?? 0}
  • Not interested: ${noReplies ?? 0}
  • Call requests: ${callRequests ?? 0}
Deals closed: ${(dealsClosed ?? []).length}
Revenue booked: $${(revenue / 100).toLocaleString()}

Open Outreach OS to action anything that needs you.

— Outreach OS`;

    await supabase.from("activity_log").insert({
      action_type: "daily_summary",
      detail: `Daily summary: ${leadsAdded ?? 0} leads, ${emailsSent ?? 0} sent, ${repliesIn ?? 0} replies, ${(dealsClosed ?? []).length} deals`,
      outcome: "success",
    });

    if (!SENDING_ENABLED) {
      return new Response(
        JSON.stringify({ success: true, sent: false, reason: "sending_disabled", subject, body }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) throw new Error("RESEND_API_KEY missing");

    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM_ADDRESS, to: TO_ADDRESS, subject, text: body }),
    });
    if (!r.ok) throw new Error(`Resend failed: ${r.status} ${await r.text()}`);

    return new Response(
      JSON.stringify({ success: true, sent: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    return new Response(
      JSON.stringify({ success: false, error: e?.message ?? String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
