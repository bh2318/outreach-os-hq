import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSettings } from "@/hooks/useData";
import { SectionLabel } from "@/components/SectionLabel";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

function useLiveStats() {
  return useQuery({
    queryKey: ["settings-live-stats"],
    queryFn: async () => {
      const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
      const [emailsToday, leadsQueue, contactedTotal] = await Promise.all([
        supabase.from("outreach_emails").select("id", { count: "exact", head: true })
          .gte("sent_at", startOfDay.toISOString()),
        supabase.from("leads").select("id", { count: "exact", head: true })
          .eq("status", "new").eq("outreach_count", 0).eq("archived", false),
        supabase.from("leads").select("id", { count: "exact", head: true })
          .gt("outreach_count", 0),
      ]);
      return {
        emailsToday: emailsToday.count ?? 0,
        leadsQueue: leadsQueue.count ?? 0,
        contactedTotal: contactedTotal.count ?? 0,
      };
    },
    refetchInterval: 10000,
  });
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`w-2 h-2 rounded-full ${ok ? "bg-status-green-text" : "bg-status-red-text"}`} />
      <span className={`text-[12px] ${ok ? "text-status-green-text" : "text-status-red-text"}`}>
        {ok ? "Connected" : "Not connected"}
      </span>
    </span>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="surface-card">
      <SectionLabel>{label}</SectionLabel>
      <div className="space-y-0">{children}</div>
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[200px_1fr] items-center gap-4 py-3 border-t border-border-faint first:border-t-0">
      <div>
        <div className="text-[12px] text-foreground">{label}</div>
        {hint && <div className="text-[10px] text-faint mt-0.5">{hint}</div>}
      </div>
      <div className="flex justify-end">{children}</div>
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`shrink-0 w-12 h-7 rounded-full border transition-colors relative ${value ? "bg-primary border-primary-fill-border" : "bg-background border-border-hover"}`}
      aria-label="toggle"
    >
      <span className={`absolute top-0.5 w-6 h-6 rounded-full bg-foreground transition-all ${value ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

export function SettingsView() {
  const { data } = useSettings();
  const { data: stats } = useLiveStats();
  const [s, setS] = useState<any>(null);
  useEffect(() => {
    if (data) {
      setS({
        operator_name: data.operator_name || "Brad Hemminger",
        reply_to_email: data.reply_to_email || "weboutreach@bhsites.com",
        invoice_business_name: data.invoice_business_name || "Brad Hemminger",
        invoice_amount_cents: (data as any).invoice_amount_cents ?? 50000,
        payment_terms_days: data.payment_terms_days ?? 0,
        payment_note: (data as any).payment_note || "",
        min_site_score: data.min_site_score ?? 45,
        outreach_active: !!data.outreach_active,
        reply_pipeline_active: !!(data as any).reply_pipeline_active,
      });
    }
  }, [data]);

  if (!s) return null;
  const update = (k: string, v: any) => setS({ ...s, [k]: v });

  const save = async () => {
    const patch = {
      operator_name: s.operator_name,
      reply_to_email: s.reply_to_email,
      invoice_business_name: s.invoice_business_name,
      invoice_amount_cents: s.invoice_amount_cents,
      payment_terms_days: s.payment_terms_days,
      payment_note: s.payment_note,
      min_site_score: s.min_site_score,
    };
    const { error } = await supabase.from("settings").update(patch as any).eq("id", 1);
    if (error) return toast.error(error.message);
    toast.success("Settings saved", { duration: 3000 });
  };

  const toggleActive = async () => {
    const next = !s.outreach_active;
    update("outreach_active", next);
    const { error } = await supabase.from("settings").update({ outreach_active: next }).eq("id", 1);
    if (error) {
      update("outreach_active", !next);
      return toast.error(error.message);
    }
    toast.success(next ? "System activated" : "System paused", { duration: 3000 });
  };

  const toggleReplyPipeline = async () => {
    const next = !s.reply_pipeline_active;
    update("reply_pipeline_active", next);
    const { error } = await supabase.from("settings").update({ reply_pipeline_active: next } as any).eq("id", 1);
    if (error) {
      update("reply_pipeline_active", !next);
      return toast.error(error.message);
    }
    // Fire webhook in the background — non-blocking.
    supabase.functions.invoke("toggle-reply-pipeline", { body: { active: next } }).catch(() => {});
    toast.success(next ? "Reply pipeline activated" : "Reply pipeline paused", { duration: 3000 });
  };

  const secretsKnown = {
    anthropic: true, googlePlaces: true, resend: true,
    gmailUser: true, gmailAppPwd: true, pipedream: true,
  };

  const showWarning = s.outreach_active && !s.reply_pipeline_active;

  return (
    <div className="space-y-4 pb-20">
      {/* Your profile */}
      <Section label="Your profile">
        <Row label="Name on emails" hint="Used in every email sign-off">
          <input className="input-base w-[280px]" value={s.operator_name ?? ""}
            onChange={(e) => update("operator_name", e.target.value)} />
        </Row>
        <Row label="Reply-to email" hint="Where business owner replies are sent">
          <input className="input-base w-[280px]" value={s.reply_to_email ?? ""}
            onChange={(e) => update("reply_to_email", e.target.value)} />
        </Row>
      </Section>

      {/* Outreach system */}
      <Section label="Outreach system">
        <div className="py-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-medium text-foreground">System active</div>
              <div className="text-[11px] mt-1">
                {s.outreach_active ? (
                  <span className="text-status-green-text">● Active — sending one outreach email every 5 minutes</span>
                ) : (
                  <span className="text-faint">○ Paused — no emails sending</span>
                )}
              </div>
              <div className="text-[11px] text-muted-foreground mt-2 font-mono">
                Emails sent today: {stats?.emailsToday ?? 0}
                <span className="text-faint"> — </span>
                Leads in queue: {stats?.leadsQueue ?? 0}
                <span className="text-faint"> — </span>
                Leads contacted total: {stats?.contactedTotal ?? 0}
              </div>
            </div>
            <Toggle value={!!s.outreach_active} onChange={toggleActive} />
          </div>
        </div>
      </Section>

      {/* Warning banner */}
      {showWarning && (
        <div className="surface-card border-status-amber-text/40 bg-status-amber-fill/20">
          <div className="text-[12px] text-status-amber-text py-1">
            ⚠ Your outreach system is active but your reply pipeline is paused. Replies from businesses will not reach your app until the Reply Pipeline is turned on.
          </div>
        </div>
      )}

      {/* Reply Pipeline */}
      <Section label="Reply Pipeline">
        <div className="py-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-medium text-foreground">Reply Pipeline Active</div>
              <div className="text-[11px] mt-1">
                {s.reply_pipeline_active ? (
                  <span className="text-status-green-text">● Pipeline active and monitoring inbox</span>
                ) : (
                  <span className="text-faint">○ Pipeline paused</span>
                )}
              </div>
            </div>
            <Toggle value={!!s.reply_pipeline_active} onChange={toggleReplyPipeline} />
          </div>
        </div>
      </Section>

      {/* Lead targeting (read-only) */}
      <Section label="Lead targeting">
        <div className="py-3 text-[12px] text-muted-foreground">
          System is automatically rotating through all Washington state cities and business categories — no configuration needed.
        </div>
        <Row label="Minimum site score to qualify"
          hint="Businesses scoring at or above this number qualify.">
          <input type="number" min={0} max={100}
            className="input-base w-[100px] text-right font-mono"
            value={s.min_site_score ?? 45}
            onChange={(e) => update("min_site_score", Number(e.target.value))} />
        </Row>
        <div className="py-3 border-t border-border-faint">
          <div className="text-[12px] text-foreground mb-2">Scoring reference</div>
          <div className="rounded-md border border-border overflow-hidden">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="bg-background">
                  <th className="text-left px-3 py-1.5 text-muted-foreground font-medium">Signal</th>
                  <th className="text-right px-3 py-1.5 text-muted-foreground font-medium w-[100px]">Points</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["No website at all", 100],
                  ["PageSpeed mobile below 30", 40],
                  ["PageSpeed mobile 30 to 50", 25],
                  ["No SSL certificate", 10],
                  ["No contact form", 8],
                  ["Site last updated over 3 years ago", 7],
                ].map(([sig, pts], i) => (
                  <tr key={i} className="border-t border-border-faint">
                    <td className="px-3 py-1.5 text-foreground">{sig}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-metric-value">{pts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="text-[10px] text-faint mt-2 leading-relaxed">
            Scores are calculated at time of scraping using publicly available signals only. Businesses with no website receive 100 points automatically and are always contacted first. All other signals are additive. A business must score above the minimum threshold to qualify for outreach. The same business will never be contacted twice regardless of score.
          </div>
        </div>
      </Section>

      {/* System status */}
      <Section label="System status">
        {[
          { label: "Claude API", hint: "Used for email writing and reply classification", ok: secretsKnown.anthropic },
          { label: "Google Places", hint: "Used for finding business leads", ok: secretsKnown.googlePlaces },
          { label: "Resend", hint: "Used for email delivery", ok: secretsKnown.resend },
          { label: "Gmail outreach account", hint: "The address emails send from and replies return to", ok: secretsKnown.gmailUser },
          { label: "Gmail app password", hint: "Grants inbox access for monitoring", ok: secretsKnown.gmailAppPwd },
          { label: "Pipedream", hint: "Routes Gmail replies to this app", ok: secretsKnown.pipedream },
        ].map((r) => (
          <Row key={r.label} label={r.label} hint={r.hint}>
            <StatusDot ok={r.ok} />
          </Row>
        ))}
      </Section>

      {/* Invoice defaults — exactly four fields */}
      <Section label="Invoice defaults">
        <Row label="Name on invoices">
          <input className="input-base w-[280px]"
            value={s.invoice_business_name ?? ""}
            onChange={(e) => update("invoice_business_name", e.target.value)} />
        </Row>
        <Row label="Default invoice amount">
          <div className="relative">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[12px] text-muted-foreground">$</span>
            <input type="number" min={0}
              className="input-base w-[140px] pl-5 text-right font-mono"
              value={Math.round((s.invoice_amount_cents ?? 50000) / 100)}
              onChange={(e) => update("invoice_amount_cents", Math.round(Number(e.target.value) * 100))} />
          </div>
        </Row>
        <Row label="Payment due">
          <select className="input-base w-[180px]"
            value={s.payment_terms_days ?? 0}
            onChange={(e) => update("payment_terms_days", Number(e.target.value))}>
            <option value={0}>Due on receipt</option>
            <option value={3}>Within 3 days</option>
            <option value={7}>Within 7 days</option>
          </select>
        </Row>
        <Row label="Payment note">
          <input className="input-base w-[380px]"
            placeholder="How you want to be paid — example: Send to my PayPal at email@example.com"
            value={s.payment_note ?? ""}
            onChange={(e) => update("payment_note", e.target.value)} />
        </Row>
      </Section>

      <div className="sticky bottom-0 bg-background pt-3">
        <button onClick={save}
          className="w-full bg-primary hover:bg-primary-hover text-primary-foreground rounded-md py-2.5 text-[12px] font-medium transition-colors">
          Save settings
        </button>
      </div>
    </div>
  );
}
