import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSettings } from "@/hooks/useData";
import { SectionLabel } from "@/components/SectionLabel";
import { ArchivedItems } from "@/components/ArchivedItems";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

function useLiveStats() {
  return useQuery({
    queryKey: ["settings-live-stats"],
    queryFn: async () => {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
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
        operator_name: (data as any).operator_name || "Brad Hemminger",
        reply_to_email: (data as any).reply_to_email || "weboutreach@bhsites.com",
        outreach_active: !!(data as any).outreach_active,
        leads_per_cycle: (data as any).leads_per_cycle ?? 10,
        minutes_between_cycles: (data as any).minutes_between_cycles ?? 1,
        daily_email_cap: (data as any).daily_email_cap ?? 1500,
        pacific_send_start: (data as any).pacific_send_start ?? "08:00:00",
        pacific_send_end: (data as any).pacific_send_end ?? "18:00:00",
        min_site_score: (data as any).min_site_score ?? 100,
        invoice_business_name: (data as any).invoice_business_name || "Brad Hemminger",
        invoice_amount: (data as any).invoice_amount ?? 500,
        payment_due: (data as any).payment_due || "Due on receipt",
        payment_note: (data as any).payment_note || "",
      });
    }
  }, [data]);

  if (!s) return null;

  const update = (k: string, v: any) => setS((prev: any) => ({ ...prev, [k]: v }));

  const toggleSystem = async () => {
    const next = !s.outreach_active;
    update("outreach_active", next);
    const { error } = await supabase
      .from("settings")
      .update({ outreach_active: next } as any)
      .eq("id", 1);
    if (error) {
      update("outreach_active", !next);
      return toast.error(error.message);
    }
    if (next) {
      supabase.functions.invoke("toggle-reply-pipeline", { body: { active: true } }).catch(() => {});
    } else {
      supabase.functions.invoke("toggle-reply-pipeline", { body: { active: false } }).catch(() => {});
    }
    toast.success(next ? "System active — outreach is running" : "System paused", { duration: 3000 });
  };

  const save = async () => {
    const patch = {
      operator_name: s.operator_name,
      reply_to_email: s.reply_to_email,
      outreach_active: s.outreach_active,
      leads_per_cycle: s.leads_per_cycle,
      minutes_between_cycles: s.minutes_between_cycles,
      daily_email_cap: s.daily_email_cap,
      pacific_send_start: s.pacific_send_start,
      pacific_send_end: s.pacific_send_end,
      min_site_score: s.min_site_score,
      invoice_business_name: s.invoice_business_name,
      invoice_amount: s.invoice_amount,
      payment_due: s.payment_due,
      payment_note: s.payment_note,
    };
    const { error } = await supabase.from("settings").update(patch as any).eq("id", 1);
    if (error) return toast.error(error.message);
    toast.success("Settings saved", { duration: 3000 });
  };

  const projected = (() => {
    const m = Math.max(1, Number(s.minutes_between_cycles ?? 1));
    const lpc = Math.max(1, Number(s.leads_per_cycle ?? 10));
    const cap = Math.max(1, Number(s.daily_email_cap ?? 1500));
    const startH = Number((s.pacific_send_start ?? "08:00:00").slice(0, 2));
    const startM = Number((s.pacific_send_start ?? "08:00:00").slice(3, 5));
    const endH = Number((s.pacific_send_end ?? "18:00:00").slice(0, 2));
    const endM = Number((s.pacific_send_end ?? "18:00:00").slice(3, 5));
    const windowMins = Math.max(0, (endH * 60 + endM) - (startH * 60 + startM));
    const windowHours = +(windowMins / 60).toFixed(1);
    const projected = Math.min(cap, Math.floor(windowMins / m) * lpc);
    return { projected, windowHours };
  })();

  return (
    <div className="space-y-4 pb-20">

      {/* SYSTEM CONTROL */}
      <Section label="System control">
        <div className="py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1">
              <div className="text-[14px] font-semibold text-foreground">
                {s.outreach_active ? "System is running" : "System is paused"}
              </div>
              <div className="text-[11px] mt-1">
                {s.outreach_active ? (
                  <span className="text-status-green-text">
                    ● Active — finding leads and sending outreach automatically
                  </span>
                ) : (
                  <span className="text-faint">
                    ○ Paused — flip the switch to start sending
                  </span>
                )}
              </div>
              <div className="text-[11px] text-muted-foreground mt-3 font-mono space-y-0.5">
                <div>Emails sent today: <span className="text-foreground">{stats?.emailsToday ?? 0}</span></div>
                <div>Leads in queue: <span className="text-foreground">{stats?.leadsQueue ?? 0}</span></div>
                <div>Total businesses contacted: <span className="text-foreground">{stats?.contactedTotal ?? 0}</span></div>
              </div>
            </div>
            <Toggle value={!!s.outreach_active} onChange={toggleSystem} />
          </div>
        </div>
      </Section>

      {/* YOUR PROFILE */}
      <Section label="Your profile">
        <Row label="Name on emails" hint="Appears in every email sign-off">
          <input
            className="input-base w-[280px]"
            value={s.operator_name ?? ""}
            onChange={(e) => update("operator_name", e.target.value)}
          />
        </Row>
        <Row label="Reply-to email" hint="Where business owner replies are sent">
          <input
            className="input-base w-[280px]"
            value={s.reply_to_email ?? ""}
            onChange={(e) => update("reply_to_email", e.target.value)}
          />
        </Row>
      </Section>

      {/* CYCLE SETTINGS */}
      <Section label="Cycle settings">
        <Row label="Minutes between cycles" hint="How often the scraper fires — 1 to 60">
          <input
            type="number" min={1} max={60}
            className="input-base w-[100px] text-right font-mono"
            value={s.minutes_between_cycles ?? 1}
            onChange={(e) => update("minutes_between_cycles", Math.max(1, Math.min(60, Number(e.target.value) || 1)))}
          />
        </Row>
        <Row label="Leads per cycle" hint="Businesses contacted per cycle — 1 to 20">
          <input
            type="number" min={1} max={20}
            className="input-base w-[100px] text-right font-mono"
            value={s.leads_per_cycle ?? 10}
            onChange={(e) => update("leads_per_cycle", Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
          />
        </Row>
        <Row label="Daily email cap" hint="Maximum outreach emails sent per day — 1 to 1500">
          <input
            type="number" min={1} max={1500}
            className="input-base w-[100px] text-right font-mono"
            value={s.daily_email_cap ?? 1500}
            onChange={(e) => update("daily_email_cap", Math.max(1, Math.min(1500, Number(e.target.value) || 1)))}
          />
        </Row>
        <Row label="Sending window start" hint="Pacific time — earliest emails send">
          <input
            type="time"
            className="input-base w-[140px] font-mono"
            value={(s.pacific_send_start ?? "08:00:00").slice(0, 5)}
            onChange={(e) => update("pacific_send_start", `${e.target.value}:00`)}
          />
        </Row>
        <Row label="Sending window end" hint="Pacific time — latest emails send">
          <input
            type="time"
            className="input-base w-[140px] font-mono"
            value={(s.pacific_send_end ?? "18:00:00").slice(0, 5)}
            onChange={(e) => update("pacific_send_end", `${e.target.value}:00`)}
          />
        </Row>
        <div className="py-3 border-t border-border-faint">
          <div className="text-[11px] text-muted-foreground leading-relaxed">
            At <span className="font-mono text-foreground">{s.leads_per_cycle}</span> leads per cycle every{" "}
            <span className="font-mono text-foreground">{s.minutes_between_cycles}</span> minute{s.minutes_between_cycles === 1 ? "" : "s"} during a{" "}
            <span className="font-mono text-foreground">{projected.windowHours}</span>-hour sending window the system contacts approximately{" "}
            <span className="font-mono text-foreground">{projected.projected}</span> businesses per day.
          </div>
        </div>
      </Section>

      {/* LEAD TARGETING */}
      <Section label="Lead targeting">
        <div className="py-3 text-[12px] text-muted-foreground">
          System rotates through all Washington state cities and business categories automatically. No configuration needed.
        </div>
        <Row label="Minimum site score" hint="Businesses scoring at or above this number qualify. Set to 100 to contact no-website businesses only.">
          <input
            type="number" min={0} max={100}
            className="input-base w-[100px] text-right font-mono"
            value={s.min_site_score ?? 100}
            onChange={(e) => update("min_site_score", Number(e.target.value))}
          />
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
            Scores are calculated at time of scraping using publicly available signals only. Businesses with no website receive 100 points automatically and are always contacted first. All other signals are additive. The same business will never be contacted twice regardless of score.
          </div>
        </div>
      </Section>

      {/* EMAIL VOICE REFERENCE */}
      <Section label="Email voice reference">
        <div className="py-3 space-y-3">
          <div>
            <div className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Sign-off format</div>
            <div className="text-[12px] text-foreground font-mono bg-background/60 rounded px-3 py-2 border border-border-faint">
              Brad Hemminger<br />Reply STOP anytime — no hard feelings
            </div>
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Banned words</div>
            <div className="text-[12px] text-faint font-mono bg-background/60 rounded px-3 py-2 border border-border-faint leading-relaxed">
              excited · thrilled · solution · transform · potential · here's the thing · convert · strings attached · we build · caught up · just reply · Bradford · county name
            </div>
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Word limits</div>
            <div className="text-[12px] text-foreground bg-background/60 rounded px-3 py-2 border border-border-faint">
              Outreach emails — under 150 words &nbsp;·&nbsp; YES responses — under 120 words
            </div>
          </div>
          <div className="text-[10px] text-faint">To modify the email voice edit the Edge Functions directly in GitHub.</div>
        </div>
      </Section>

      {/* SYSTEM STATUS */}
      <Section label="System status">
        {[
          { label: "Claude API", hint: "Generates outreach emails and classifies replies", ok: true },
          { label: "Google Places API", hint: "Finds local businesses across Washington state", ok: true },
          { label: "Resend", hint: "Delivers outreach emails from weboutreach@bhsites.com", ok: true },
          { label: "Gmail outreach account", hint: "b.h.weboutreach@gmail.com — sends and receives", ok: true },
          { label: "Pipedream", hint: "Monitors inbox every 5 minutes and routes replies to this app", ok: true },
          { label: "Supabase", hint: "Database, storage, and Edge Functions", ok: true },
        ].map((r) => (
          <div key={r.label} className="grid grid-cols-[200px_1fr] items-center gap-4 py-3 border-t border-border-faint first:border-t-0">
            <div>
              <div className="text-[12px] text-foreground">{r.label}</div>
              {r.hint && <div className="text-[10px] text-faint mt-0.5">{r.hint}</div>}
            </div>
            <div className="flex justify-end">
              <span className="inline-flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${r.ok ? "bg-status-green-text" : "bg-status-red-text"}`} />
                <span className={`text-[12px] ${r.ok ? "text-status-green-text" : "text-status-red-text"}`}>
                  {r.ok ? "Connected" : "Not connected"}
                </span>
              </span>
            </div>
          </div>
        ))}
      </Section>

      {/* INVOICE DEFAULTS */}
      <Section label="Invoice defaults">
        <Row label="Name on invoices">
          <input
            className="input-base w-[280px]"
            value={s.invoice_business_name ?? ""}
            onChange={(e) => update("invoice_business_name", e.target.value)}
          />
        </Row>
        <Row label="Default invoice amount">
          <div className="relative">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[12px] text-muted-foreground">$</span>
            <input
              type="number" min={0}
              className="input-base w-[140px] pl-5 text-right font-mono"
              value={s.invoice_amount ?? 500}
              onChange={(e) => update("invoice_amount", Number(e.target.value))}
            />
          </div>
        </Row>
        <Row label="Payment due">
          <select
            className="input-base w-[180px]"
            value={s.payment_due ?? "Due on receipt"}
            onChange={(e) => update("payment_due", e.target.value)}
          >
            <option value="Due on receipt">Due on receipt</option>
            <option value="Within 3 days">Within 3 days</option>
            <option value="Within 7 days">Within 7 days</option>
          </select>
        </Row>
        <Row label="Payment note" hint="Appears at the bottom of every invoice">
          <input
            className="input-base w-[380px]"
            placeholder="How you want to be paid — example: Send to my PayPal at email@example.com"
            value={s.payment_note ?? ""}
            onChange={(e) => update("payment_note", e.target.value)}
          />
        </Row>
      </Section>

      {/* ARCHIVED ITEMS */}
      <ArchivedItems />

      {/* SAVE BUTTON */}
      <div className="sticky bottom-0 bg-background pt-3">
        <button
          onClick={save}
          className="w-full bg-primary hover:bg-primary-hover text-primary-foreground rounded-md py-2.5 text-[12px] font-medium transition-colors"
        >
          Save settings
        </button>
      </div>

    </div>
  );
}
