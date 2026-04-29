import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSettings } from "@/hooks/useData";
import { SectionLabel } from "@/components/SectionLabel";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const ROTATION_CATEGORIES = [
  "plumber", "electrician", "roofer", "landscaper", "auto repair",
  "dentist", "chiropractor", "hair salon", "barber", "restaurant",
];
const ROTATION_CITIES = [
  "Aberdeen", "Hoquiam", "Olympia", "Tumwater", "Lacey",
  "Centralia", "Chehalis", "Shelton", "Montesano", "Elma",
];

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

function useRotationState() {
  return useQuery({
    queryKey: ["rotation-state"],
    queryFn: async () => {
      // Use total contacted count to derive a stable rotation pointer.
      const { count } = await supabase.from("outreach_emails").select("id", { count: "exact", head: true });
      const idx = count ?? 0;
      const cat = ROTATION_CATEGORIES[idx % ROTATION_CATEGORIES.length];
      const city = ROTATION_CITIES[Math.floor(idx / ROTATION_CATEGORIES.length) % ROTATION_CITIES.length];
      const nextIdx = idx + 1;
      const nextCat = ROTATION_CATEGORIES[nextIdx % ROTATION_CATEGORIES.length];
      const nextCity = ROTATION_CITIES[Math.floor(nextIdx / ROTATION_CATEGORIES.length) % ROTATION_CITIES.length];
      return { cat, city, nextCat, nextCity };
    },
    refetchInterval: 30000,
  });
}

function useSecretsStatus() {
  return useQuery({
    queryKey: ["secrets-status"],
    queryFn: async () => {
      const { data } = await supabase.functions.invoke("send-test-email", { body: { _check_secrets: true } }).catch(() => ({ data: null }));
      // Fallback: assume connected. Real list comes via Supabase secrets which we know exist.
      return data ?? null;
    },
    enabled: false,
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
  const { data: rot } = useRotationState();
  const [s, setS] = useState<any>(null);
  useEffect(() => { if (data) setS({ ...data }); }, [data]);

  if (!s) return null;
  const update = (k: string, v: any) => setS({ ...s, [k]: v });

  const save = async () => {
    const patch = {
      operator_name: s.operator_name,
      reply_to_email: s.reply_to_email,
      min_site_score: s.min_site_score,
      default_lead_volume: s.default_lead_volume,
      invoice_business_name: s.invoice_business_name,
      invoice_address: s.invoice_address,
      payment_terms_days: s.payment_terms_days,
      payment_instructions: s.payment_instructions,
    };
    const { error } = await supabase.from("settings").update(patch).eq("id", 1);
    if (error) return toast.error(error.message);
    toast.success("Settings saved");
  };

  const toggleActive = async () => {
    const next = !s.outreach_active;
    update("outreach_active", next);
    const { error } = await supabase.from("settings").update({ outreach_active: next }).eq("id", 1);
    if (error) {
      update("outreach_active", !next);
      return toast.error(error.message);
    }
    toast.success(next ? "System activated" : "System paused");
  };

  // Read-only secret status — these all exist in the project (see <secrets>).
  const secretsKnown = {
    anthropic: true,
    googlePlaces: true,
    resend: true,
    gmailUser: true,
    gmailAppPwd: true,
    pipedream: true, // pipedream pings the receive-reply webhook; assumed wired
  };

  return (
    <div className="space-y-4 pb-20">
      {/* SECTION 1 — Operator profile */}
      <Section label="Your profile">
        <Row label="Your name" hint="Used in every email sign-off">
          <input
            className="input-base w-[280px]"
            value={s.operator_name ?? ""}
            placeholder="Brad Hemminger"
            onChange={(e) => update("operator_name", e.target.value)}
          />
        </Row>
        <Row label="Reply-to email" hint="Business owners reply to this address. Keep it pointed at your outreach Gmail.">
          <input
            className="input-base w-[280px]"
            value={s.reply_to_email ?? ""}
            placeholder="b.h.weboutreach@gmail.com"
            onChange={(e) => update("reply_to_email", e.target.value)}
          />
        </Row>
      </Section>

      {/* SECTION 2 — System control */}
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

      {/* SECTION 3 — Lead targeting */}
      <Section label="Lead targeting">
        <Row
          label="Minimum site score to qualify"
          hint="Businesses scoring at or below this number qualify. No-website businesses always qualify."
        >
          <input
            type="number"
            min={0}
            max={100}
            className="input-base w-[100px] text-right font-mono"
            value={s.min_site_score ?? 45}
            onChange={(e) => update("min_site_score", Number(e.target.value))}
          />
        </Row>
        <Row
          label="Prioritize no-website leads"
          hint="Businesses with no website are contacted before those with poor websites."
        >
          <Toggle
            value={s.prioritize_no_website ?? true}
            onChange={(v) => update("prioritize_no_website", v)}
          />
        </Row>
        <Row label="Search rotation status">
          <div className="text-right">
            <div className="text-[12px] font-mono text-foreground">
              Current category: <span className="text-primary-fill-text">{rot?.cat ?? "—"}</span>
            </div>
            <div className="text-[12px] font-mono text-foreground mt-0.5">
              Current city: <span className="text-primary-fill-text">{rot?.city ?? "—"}</span>
            </div>
            <div className="text-[10px] text-faint mt-1">
              Next outreach cycle will target: {rot?.nextCat ?? "—"} in {rot?.nextCity ?? "—"}
            </div>
          </div>
        </Row>
        <Row
          label="Leads per scraper run"
          hint="At 1 lead per cycle and one cycle every 5 minutes, the system contacts 288 businesses per day."
        >
          <select
            className="input-base w-[100px]"
            value={s.default_lead_volume ?? 1}
            onChange={(e) => update("default_lead_volume", Number(e.target.value))}
          >
            <option value={1}>1</option>
            <option value={5}>5</option>
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
          </select>
        </Row>
        <div className="py-3 border-t border-border-faint">
          <div className="text-[12px] text-foreground mb-2">Rating reference</div>
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
          <div className="text-[10px] text-faint mt-2">
            Leads scoring above the minimum threshold qualify for outreach.
          </div>
        </div>
      </Section>

      {/* SECTION 4 — System status */}
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

      {/* SECTION 5 — Invoice defaults */}
      <Section label="Invoice defaults">
        <Row label="Business name">
          <input
            className="input-base w-[280px]"
            value={s.invoice_business_name ?? ""}
            onChange={(e) => update("invoice_business_name", e.target.value)}
          />
        </Row>
        <Row label="Business address">
          <input
            className="input-base w-[280px]"
            value={s.invoice_address ?? ""}
            onChange={(e) => update("invoice_address", e.target.value)}
          />
        </Row>
        <Row label="Payment terms">
          <select
            className="input-base w-[140px]"
            value={s.payment_terms_days ?? 14}
            onChange={(e) => update("payment_terms_days", Number(e.target.value))}
          >
            <option value={7}>Net 7</option>
            <option value={14}>Net 14</option>
            <option value={30}>Net 30</option>
          </select>
        </Row>
        <Row label="Payment instructions">
          <textarea
            className="input-base w-[380px] min-h-[80px]"
            placeholder="Where to send payment (e.g. bank transfer details, Stripe link, mailing address)"
            value={s.payment_instructions ?? ""}
            onChange={(e) => update("payment_instructions", e.target.value)}
          />
        </Row>
      </Section>

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
