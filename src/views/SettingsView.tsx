import { useEffect, useState } from "react";
import { useSettings } from "@/hooks/useData";
import { SectionLabel } from "@/components/SectionLabel";
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

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="grid grid-cols-[180px_1fr] items-start gap-3">
      <label className="text-[11px] text-muted-foreground pt-1.5">
        {label}
        {hint && <div className="text-[10px] text-faint mt-0.5">{hint}</div>}
      </label>
      <div>{children}</div>
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
    // Only persist visible fields
    const patch = {
      operator_name: s.operator_name,
      operator_city: s.operator_city,
      reply_to_email: s.reply_to_email,
      default_lead_volume: s.default_lead_volume,
      min_site_score: s.min_site_score,
      excluded_niches: s.excluded_niches,
      invoice_business_name: s.invoice_business_name,
      invoice_address: s.invoice_address,
      payment_terms_days: s.payment_terms_days,
      payment_instructions: s.payment_instructions,
    };
    const { error } = await supabase.from("settings").update(patch).eq("id", 1);
    if (error) return toast.error(error.message);
    toast.success("Settings saved");
  };

  return (
    <div className="space-y-4 pb-20">
      <Group label="Your profile">
        <Field label="Operator name" hint="Used as email signature">
          <input className="input-base w-full" value={s.operator_name ?? ""} onChange={e => update("operator_name", e.target.value)} />
        </Field>
        <Field label="City in outreach" hint="Mentioned in the email opener">
          <input className="input-base w-full" value={s.operator_city ?? ""} onChange={e => update("operator_city", e.target.value)} />
        </Field>
        <Field label="Reply-to email">
          <input className="input-base w-full" value={s.reply_to_email ?? ""} onChange={e => update("reply_to_email", e.target.value)} />
        </Field>
      </Group>

      <Group label="Outreach scheduler">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-md border border-border bg-background/40">
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-medium text-foreground">Daily outreach automation</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">Sends up to 250 emails per day, 9am–5pm operator time</div>
            <div className="text-[11px] mt-1">
              {s.outreach_active ? (
                <span className="text-status-green-text">● Active — runs daily at 15:00 UTC</span>
              ) : (
                <span className="text-faint">○ Paused — toggle on to activate</span>
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

      <Group label="Scraper defaults">
        <Field label="Default lead volume">
          <select className="input-base w-full" value={s.default_lead_volume} onChange={e => update("default_lead_volume", Number(e.target.value))}>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={200}>200</option>
            <option value={250}>250</option>
          </select>
        </Field>
        <Field label={`Min site score (${s.min_site_score})`} hint="Skip leads above this score">
          <input type="range" min={0} max={100} value={s.min_site_score} onChange={e => update("min_site_score", Number(e.target.value))} className="w-full accent-[hsl(var(--primary))]" />
        </Field>
        <Field label="Excluded niches" hint="Comma separated">
          <input className="input-base w-full" placeholder="e.g. lawyers, dentists" value={(s.excluded_niches ?? []).join(", ")} onChange={e => update("excluded_niches", e.target.value.split(",").map((x: string) => x.trim()).filter(Boolean))} />
        </Field>
      </Group>

      <Group label="Invoice defaults">
        <Field label="Business name">
          <input className="input-base w-full" value={s.invoice_business_name ?? ""} onChange={e => update("invoice_business_name", e.target.value)} />
        </Field>
        <Field label="Business address">
          <input className="input-base w-full" value={s.invoice_address ?? ""} onChange={e => update("invoice_address", e.target.value)} />
        </Field>
        <Field label="Payment terms">
          <select className="input-base w-full" value={s.payment_terms_days} onChange={e => update("payment_terms_days", Number(e.target.value))}>
            <option value={7}>Net 7</option>
            <option value={14}>Net 14</option>
            <option value={30}>Net 30</option>
          </select>
        </Field>
        <Field label="Payment instructions">
          <textarea className="input-base w-full min-h-[80px]" value={s.payment_instructions ?? ""} onChange={e => update("payment_instructions", e.target.value)} />
        </Field>
      </Group>

      <div className="sticky bottom-0 bg-background pt-3">
        <button onClick={save} className="w-full bg-primary hover:bg-primary-hover text-primary-foreground rounded-md py-2.5 text-[12px] font-medium transition-colors">
          Save settings
        </button>
      </div>
    </div>
  );
}
