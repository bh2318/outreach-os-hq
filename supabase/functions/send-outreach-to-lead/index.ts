// send-outreach-to-lead
// Generates one outreach email via Claude haiku and sends it via Resend.
// For test purposes: from = onboarding@resend.dev, reply-to = b.h.weboutreach@gmail.com,
// recipient = b.h.weboutreach@gmail.com (always — so test sends arrive in the outreach inbox).
// Logs the sent email to outreach_emails linked to the lead_id.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Resend sandbox mode (no verified domain) only allows sending to the
// account owner's address. Route the test email there, but set reply_to
// to the outreach inbox so replies still land in the right Gmail account.
const TEST_RECIPIENT = "b.hemminger18@gmail.com";
const REPLY_TO = "b.h.weboutreach@gmail.com";

const PROMPT_SYSTEM =
  "You write short, direct, plain-text cold outreach emails offering a free website mockup to small local businesses. Tone: a friendly local — never corporate. No emojis. No markdown. No greetings like 'Dear'. 90-130 words. End with a one-line question. Respond with ONLY two parts separated by '---': line 1 the subject, then '---' on its own line, then the body.";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { leadId } = await req.json();
    if (!leadId) {
      return new Response(JSON.stringify({ success: false, error: "leadId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANTHROPIC = Deno.env.get("ANTHROPIC_API_KEY");
    const RESEND = Deno.env.get("RESEND_API_KEY");
    if (!ANTHROPIC) throw new Error("ANTHROPIC_API_KEY not configured");
    if (!RESEND) throw new Error("RESEND_API_KEY not configured");

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: lead, error: leadErr } = await supabase
      .from("leads")
      .select("id, business_name, niche, city, state, phone, website_url, rating, review_count")
      .eq("id", leadId)
      .single();
    if (leadErr || !lead) throw new Error(`lead not found: ${leadErr?.message ?? "no row"}`);

    const userMsg = `Business: ${lead.business_name}
Niche: ${lead.niche ?? "local business"}
City: ${lead.city ?? "their area"}
Has website: ${lead.website_url ? "yes" : "no"}
Rating: ${lead.rating ?? "n/a"} (${lead.review_count ?? 0} reviews)

Write the cold email now.`;

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 200,
        system: PROMPT_SYSTEM,
        messages: [{ role: "user", content: userMsg }],
      }),
    });
    if (!claudeRes.ok) {
      const t = await claudeRes.text();
      throw new Error(`Claude failed: ${claudeRes.status} ${t}`);
    }
    const cd = await claudeRes.json();
    const fullText: string = (cd?.content?.[0]?.text ?? "").trim();
    let subject = `Quick question for ${lead.business_name}`;
    let body = fullText;
    const sepIdx = fullText.indexOf("---");
    if (sepIdx !== -1) {
      subject = fullText.slice(0, sepIdx).trim().replace(/^subject:\s*/i, "") || subject;
      body = fullText.slice(sepIdx + 3).trim();
    }

    // Send via Resend
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "onboarding@resend.dev",
        to: [TEST_RECIPIENT],
        reply_to: REPLY_TO,
        subject,
        text: body,
      }),
    });
    const resendJson = await resendRes.json();
    if (!resendRes.ok) {
      throw new Error(`Resend failed: ${resendRes.status} ${JSON.stringify(resendJson)}`);
    }

    const now = new Date().toISOString();
    await supabase.from("outreach_emails").insert({
      lead_id: lead.id,
      sequence_number: 1,
      subject,
      body,
      status: "sent",
      sent_at: now,
    });
    await supabase
      .from("leads")
      .update({ status: "contacted", last_contacted: now, outreach_count: 1 })
      .eq("id", lead.id);
    await supabase.from("activity_log").insert({
      action_type: "email_sent",
      business_name: lead.business_name,
      lead_id: lead.id,
      detail: `test outreach sent to ${TEST_RECIPIENT}`,
      outcome: "success",
    });

    return new Response(
      JSON.stringify({ success: true, leadId: lead.id, business_name: lead.business_name, subject, body, resend_id: resendJson.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[send-outreach-to-lead] error", e);
    return new Response(JSON.stringify({ success: false, error: String(e instanceof Error ? e.message : e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
