import { useEffect, useState } from "react";
import { useSettings } from "@/hooks/useData";
import { SectionLabel } from "@/components/SectionLabel";
import { Badge } from "@/components/Badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="surface-card">
      <SectionLabel>{label}</SectionLabel>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[180px_1fr] items-center gap-3">
      <label className="text-[11px] text-muted-foreground">{label}</label>
      <div>{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`w-9 h-5 rounded-full border transition-colors relative ${checked ? "bg-primary border-primary-fill-border" : "bg-background border-border-hover"}`}
    >
      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-foreground transition-all ${checked ? "left-[18px]" : "left-0.5"}`} />
    </button>
  );
}

function IntegrationRow({ label, connected }: { label: string; connected: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[12px] text-foreground">{label}</span>
      {connected ? <Badge tone="green">Connected</Badge> : <button className="btn-ghost">Connect</button>}
    </div>
  );
}

export function SettingsView() {
  const { data } = useSettings();
  const [s, setS] = useState<any>(null);
  useEffect(() => { if (data) setS({ ...data }); }, [data]);

  if (!s) return null;

  const update = (k: string, v: any) => setS({ ...s, [k]: v });

  const save = async () => {
    const { error } = await supabase.from("settings").update(s).eq("id", 1);
    if (error) return toast.error(error.message);
    toast.success("Settings saved");
  };

  return (
    <div className="space-y-4 pb-20">
      <Group label="Your profile">
        <Field label="Operator name"><input className="input-base w-full" value={s.operator_name ?? ""} onChange={e => update("operator_name", e.target.value)} /></Field>
        <Field label="City in outreach"><input className="input-base w-full" value={s.operator_city ?? ""} onChange={e => update("operator_city", e.target.value)} /></Field>
        <Field label="Reply-to email"><input className="input-base w-full" value={s.reply_to_email ?? ""} onChange={e => update("reply_to_email", e.target.value)} /></Field>
        <Field label="Logo upload"><button className="btn-ghost">Upload logo</button></Field>
      </Group>

      <Group label="Outreach Scheduler">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-md border border-border bg-background/40">
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-medium text-foreground">Send daily outreach</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">250 emails per day, 7am to 7pm</div>
            <div className="text-[11px] mt-1">
              {s.outreach_active ? (
                <span className="text-status-green-text">Scheduler active — next run today at 7am</span>
              ) : (
                <span className="text-faint">Scheduler paused</span>
              )}
            </div>
          </div>
          <button
            onClick={async () => {
              const next = !s.outreach_active;
              update("outreach_active", next);
              const { error } = await supabase.from("settings").update({ outreach_active: next }).eq("id", 1);
              if (error) {
                update("outreach_active", !next);
                return toast.error(error.message);
              }
              toast.success(next ? "Scheduler activated" : "Scheduler paused");
            }}
            className={`shrink-0 w-14 h-8 rounded-full border transition-colors relative ${s.outreach_active ? "bg-primary border-primary-fill-border" : "bg-background border-border-hover"}`}
            aria-label="Toggle daily outreach scheduler"
          >
            <span className={`absolute top-0.5 w-7 h-7 rounded-full bg-foreground transition-all ${s.outreach_active ? "left-[26px]" : "left-0.5"}`} />
          </button>
        </div>
      </Group>

      <Group label="Outreach">
        <Field label="Daily send limit"><input type="number" className="input-base w-full" value={s.daily_send_limit} onChange={e => update("daily_send_limit", Number(e.target.value))} /></Field>
        <Field label="Send window start"><input type="time" className="input-base w-full" value={s.send_window_start} onChange={e => update("send_window_start", e.target.value)} /></Field>
        <Field label="Send window end"><input type="time" className="input-base w-full" value={s.send_window_end} onChange={e => update("send_window_end", e.target.value)} /></Field>
        <Field label="Require approval"><Toggle checked={s.require_approval} onChange={v => update("require_approval", v)} /></Field>
        <Field label="Auto follow-up"><Toggle checked={s.auto_followup} onChange={v => update("auto_followup", v)} /></Field>
        <Field label="Follow-up days">
          <input className="input-base w-full" value={(s.followup_days ?? []).join(", ")} onChange={e => update("followup_days", e.target.value.split(",").map(x => Number(x.trim())).filter(Boolean))} />
        </Field>
      </Group>

      <Group label="Scraper defaults">
        <Field label="Default lead volume">
          <select className="input-base w-full" value={s.default_lead_volume} onChange={e => update("default_lead_volume", Number(e.target.value))}>
            <option value={50}>50</option><option value={100}>100</option><option value={200}>200</option>
          </select>
        </Field>
        <Field label={`Min site score (${s.min_site_score})`}>
          <input type="range" min={0} max={100} value={s.min_site_score} onChange={e => update("min_site_score", Number(e.target.value))} className="w-full accent-[hsl(var(--primary))]" />
        </Field>
        <Field label="Excluded niches">
          <input className="input-base w-full" placeholder="comma separated" value={(s.excluded_niches ?? []).join(", ")} onChange={e => update("excluded_niches", e.target.value.split(",").map(x => x.trim()).filter(Boolean))} />
        </Field>
      </Group>

      <Group label="Invoice defaults">
        <Field label="Business name"><input className="input-base w-full" value={s.invoice_business_name ?? ""} onChange={e => update("invoice_business_name", e.target.value)} /></Field>
        <Field label="Business address"><input className="input-base w-full" value={s.invoice_address ?? ""} onChange={e => update("invoice_address", e.target.value)} /></Field>
        <Field label="Payment terms">
          <select className="input-base w-full" value={s.payment_terms_days} onChange={e => update("payment_terms_days", Number(e.target.value))}>
            <option value={7}>Net 7</option><option value={14}>Net 14</option><option value={30}>Net 30</option>
          </select>
        </Field>
        <Field label="Payment instructions">
          <textarea className="input-base w-full min-h-[80px]" value={s.payment_instructions ?? ""} onChange={e => update("payment_instructions", e.target.value)} />
        </Field>
      </Group>

      <Group label="Integrations">
        <IntegrationRow label="Google Places API" connected={!!s.google_places_key} />
        <IntegrationRow label="Gmail / sending account" connected={false} />
        <IntegrationRow label="Claude API key" connected={!!s.claude_api_key} />
        <IntegrationRow label="Stripe" connected={s.stripe_connected} />
        <IntegrationRow label="Calendly" connected={s.calendly_connected} />
      </Group>

      <div className="sticky bottom-0 bg-background pt-3">
        <button onClick={save} className="w-full bg-primary hover:bg-primary-hover text-primary-foreground rounded-md py-2.5 text-[12px] font-medium transition-colors">
          Save settings
        </button>
      </div>
    </div>
  );
}
