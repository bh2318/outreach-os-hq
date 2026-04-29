import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type LogKind = "scrape" | "send" | "check" | "info" | "error" | "classify";
type LogEntry = {
  id: string;
  kind: LogKind;
  timestamp: string;
  title: string;
  detail?: string;
  data?: Record<string, unknown>;
};

type Business = {
  lead_id: string | null;
  place_id: string;
  business_name: string;
  phone: string | null;
  rating: number | null;
  review_count: number | null;
  website_url: string | null;
  has_website: boolean;
  address: string | null;
  city: string | null;
  state: string | null;
  inserted: boolean;
};

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function TestEmails() {
  const [niche, setNiche] = useState("plumber");
  const [city, setCity] = useState("Tacoma, WA");
  const [scraping, setScraping] = useState(false);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);

  function pushLog(entry: Omit<LogEntry, "id" | "timestamp">) {
    setLog((prev) => [
      { id: crypto.randomUUID(), timestamp: new Date().toISOString(), ...entry },
      ...prev,
    ]);
  }

  async function handleScrape() {
    if (scraping || !niche.trim() || !city.trim()) return;
    setScraping(true);
    try {
      pushLog({ kind: "scrape", title: "Running scraper…", detail: `${niche} in ${city}` });
      const { data, error } = await supabase.functions.invoke("scrape-places", {
        body: { niche: niche.trim(), city: city.trim() },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error ?? "Scraper failed");
      setBusinesses(data.businesses ?? []);
      const inserted = (data.businesses ?? []).filter((b: Business) => b.inserted).length;
      pushLog({
        kind: "scrape",
        title: `Scraper returned ${data.count} businesses`,
        detail: `${inserted} new, ${data.count - inserted} already in leads`,
        data,
      });
      toast.success(`${data.count} businesses found (${inserted} new)`);
    } catch (e) {
      const message = getErrorMessage(e, "Scrape failed");
      pushLog({ kind: "error", title: "Scrape failed", detail: message });
      toast.error(message);
    } finally {
      setScraping(false);
    }
  }

  async function handleSendOutreach(b: Business) {
    if (!b.lead_id || sendingId) return;
    setSendingId(b.lead_id);
    try {
      pushLog({ kind: "send", title: `Sending outreach → ${b.business_name}`, detail: "Generating with Claude…" });
      const { data, error } = await supabase.functions.invoke("send-outreach-to-lead", {
        body: { leadId: b.lead_id },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error ?? "Send failed");
      pushLog({
        kind: "send",
        title: `Sent → ${data.business_name}`,
        detail: data.subject,
        data: { body: data.body, ...data },
      });
      toast.success(`Outreach sent to inbox for ${data.business_name}`);
    } catch (e) {
      const message = getErrorMessage(e, "Send failed");
      pushLog({ kind: "error", title: "Send failed", detail: message });
      toast.error(message);
    } finally {
      setSendingId(null);
    }
  }

  async function handleTestWebhook() {
    if (testingWebhook) return;
    setTestingWebhook(true);
    try {
      // Find most recent outreach_emails row → its lead → business name.
      const { data: lastSent, error: sentErr } = await supabase
        .from("outreach_emails")
        .select("lead_id, sent_at")
        .not("lead_id", "is", null)
        .order("sent_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      if (sentErr) throw sentErr;
      if (!lastSent?.lead_id) {
        throw new Error("No outreach emails sent yet — send one first.");
      }
      const { data: lead } = await supabase
        .from("leads")
        .select("business_name")
        .eq("id", lastSent.lead_id)
        .maybeSingle();

      const businessName = lead?.business_name ?? "your business";
      const payload = {
        from: "b.h.weboutreach@gmail.com",
        subject: `Re: Quick question for ${businessName}`,
        body: "yeah this sounds interesting tell me more",
      };
      pushLog({
        kind: "check",
        title: "Posting to receive-reply webhook…",
        detail: `from ${payload.from} · ${businessName}`,
        data: { body: payload.body },
      });
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/receive-reply`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      pushLog({
        kind: data?.classification === "YES" ? "classify" : "check",
        title: `Webhook response ${res.status}`,
        detail: JSON.stringify(data),
        data,
      });
      if (res.ok && data?.status === "success") {
        toast.success(`Webhook OK — ${data.classification ?? data.message ?? "processed"}`);
      } else {
        toast.error(`Webhook failed: ${res.status}`);
      }
    } catch (e) {
      const message = getErrorMessage(e, "Webhook test failed");
      pushLog({ kind: "error", title: "Webhook test failed", detail: message });
      toast.error(message);
    } finally {
      setTestingWebhook(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-[1100px] mx-auto px-6 py-8">
        <header className="mb-6">
          <h1 className="text-xl font-semibold">Outreach Test Bench</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Real Google Places scrape → send a generated outreach email → simulate a forwarded reply.
          </p>
        </header>

        {/* SECTION 1 — Scraper */}
        <section className="rounded-lg border border-border bg-card p-4 mb-4">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-3">
            1. Scrape real businesses (Google Places)
          </div>
          <div className="flex flex-col md:flex-row gap-3">
            <input
              type="text"
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
              placeholder="Niche (e.g. plumber)"
              className="flex-1 rounded-md bg-background border border-border px-3 py-2 text-sm"
            />
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="City (e.g. Tacoma, WA)"
              className="flex-1 rounded-md bg-background border border-border px-3 py-2 text-sm"
            />
            <button
              onClick={handleScrape}
              disabled={scraping || !niche.trim() || !city.trim()}
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {scraping ? "Scraping…" : "Run Scraper"}
            </button>
          </div>
        </section>

        {/* SECTION 2 — Results & per-business send */}
        <section className="rounded-lg border border-border bg-card p-4 mb-4">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-3">
            2. Scraped businesses ({businesses.length})
          </div>
          {businesses.length === 0 ? (
            <p className="text-sm text-muted-foreground">No results yet. Run the scraper above.</p>
          ) : (
            <ul className="divide-y divide-border">
              {businesses.map((b) => (
                <li key={b.place_id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">
                      {b.business_name}
                      {b.inserted && (
                        <span className="ml-2 text-[10px] uppercase tracking-wide text-emerald-400">new</span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {b.phone ?? "no phone"} · ★ {b.rating ?? "—"} ({b.review_count ?? 0}) ·{" "}
                      {b.has_website ? (
                        <span className="text-amber-400">has website</span>
                      ) : (
                        <span className="text-emerald-400">no website</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleSendOutreach(b)}
                    disabled={!b.lead_id || sendingId === b.lead_id}
                    className="shrink-0 px-3 py-1.5 rounded-md border border-border text-xs font-medium hover:bg-card-foreground/5 disabled:opacity-50"
                  >
                    {sendingId === b.lead_id ? "Sending…" : "Send Outreach Email"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* SECTION 3 — Webhook test */}
        <section className="rounded-lg border border-border bg-card p-4 mb-6">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-3">
            3. Simulate a forwarded reply (webhook test)
          </div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Posts a YES-style reply to <code>receive-reply</code> from <code>b.h.weboutreach@gmail.com</code>,
              attributed to the most recently contacted lead.
            </p>
            <button
              onClick={handleTestWebhook}
              disabled={testingWebhook}
              className="shrink-0 px-4 py-2 rounded-md border border-border text-sm font-medium hover:bg-card-foreground/5 disabled:opacity-50"
            >
              {testingWebhook ? "Posting…" : "Test Webhook"}
            </button>
          </div>
        </section>

        {/* Live log */}
        <div className="space-y-3">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Live log
          </div>
          {log.length === 0 && (
            <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
              No activity yet.
            </div>
          )}
          {log.map((it) => (
            <article key={it.id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-4 mb-1">
                <div className="flex items-center gap-2 min-w-0">
                  <Badge kind={it.kind} />
                  <span className="text-sm font-semibold truncate">{it.title}</span>
                </div>
                <div className="text-xs text-muted-foreground shrink-0">
                  {new Date(it.timestamp).toLocaleTimeString()}
                </div>
              </div>
              {it.detail && <p className="text-sm text-foreground/80 mt-1">{it.detail}</p>}
              {typeof it.data?.body === "string" && (
                <pre className="text-sm whitespace-pre-wrap font-sans text-foreground/90 bg-background/50 rounded p-3 border border-border/50 mt-3">
                  {it.data.body as string}
                </pre>
              )}
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

function Badge({ kind }: { kind: LogKind }) {
  const map: Record<LogKind, { label: string; color: string; bg: string }> = {
    scrape: { label: "SCRAPE", color: "#bae6fd", bg: "rgba(56,189,248,.15)" },
    send: { label: "SEND", color: "#a7f3d0", bg: "rgba(16,185,129,.12)" },
    classify: { label: "CLASSIFY", color: "#c4b5fd", bg: "rgba(124,92,255,.15)" },
    check: { label: "CHECK", color: "#fde68a", bg: "rgba(234,179,8,.15)" },
    info: { label: "INFO", color: "#cbd5e1", bg: "rgba(148,163,184,.15)" },
    error: { label: "ERROR", color: "#fecaca", bg: "rgba(239,68,68,.15)" },
  };
  const s = map[kind];
  return (
    <span
      className="text-[10px] font-mono px-1.5 py-0.5 rounded"
      style={{ color: s.color, background: s.bg }}
    >
      {s.label}
    </span>
  );
}
