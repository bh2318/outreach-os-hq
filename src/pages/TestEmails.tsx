import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNotifications } from "@/components/notifications/NotificationsProvider";
import type { YesNotification } from "@/components/notifications/NotificationsProvider";

type LogEntry = {
  id: string;
  kind: "send" | "classify" | "info" | "error" | "check";
  timestamp: string;
  title: string;
  detail?: string;
  data?: {
    body?: string;
    intent?: string;
    rawClassification?: string;
    model?: string;
    [key: string]: unknown;
  };
};

const SCENARIOS = [
  { key: "mikes-plumbing", label: "Mike's Plumbing — Tacoma, WA" },
  { key: "green-thumb", label: "Green Thumb Landscaping — Olympia, WA" },
  { key: "peak-roofing", label: "Peak Roofing Co — Aberdeen, WA" },
  { key: "bright-clean", label: "Bright Clean Services — Centralia, WA" },
  { key: "sunrise-hvac", label: "Sunrise HVAC — Hoquiam, WA" },
];

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function TestEmails() {
  const { showNow } = useNotifications();
  const [scenarioKey, setScenarioKey] = useState(SCENARIOS[0].key);
  const [sending, setSending] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [classifying, setClassifying] = useState(false);
  const [checkingInbox, setCheckingInbox] = useState(false);
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [lastLeadId, setLastLeadId] = useState<string | null>(null);
  const [lastBusinessName, setLastBusinessName] = useState<string | null>(null);

  async function handleTestWebhook() {
    if (testingWebhook) return;
    setTestingWebhook(true);
    try {
      const { data: latestLead, error: leadErr } = await supabase
        .from("leads")
        .select("email, business_name")
        .not("email", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (leadErr) throw leadErr;
      if (!latestLead?.email) {
        throw new Error("No lead with an email found in the leads table");
      }
      const payload = {
        from: latestLead.email,
        subject: `Re: Quick question for ${latestLead.business_name ?? "your business"}`,
        body: "yeah this sounds interesting tell me more",
      };
      pushLog({
        kind: "check",
        title: "Posting to receive-reply webhook…",
        detail: `from ${payload.from}`,
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

  async function handleCheckInbox() {
    if (checkingInbox) return;
    setCheckingInbox(true);
    try {
      pushLog({ kind: "check", title: "Polling Gmail inbox…", detail: "Calling poll-gmail-inbox" });
      const { data, error } = await supabase.functions.invoke("poll-gmail-inbox", { body: {} });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error ?? "Inbox poll failed");
      pushLog({
        kind: "check",
        title: `Inbox checked — ${data.processed ?? 0} processed`,
        detail: `YES ${data.yes ?? 0} · NO ${data.no ?? 0} · MAYBE ${data.maybe ?? 0} · unmatched ${data.unmatched ?? 0}`,
        data,
      });
      toast.success(`Inbox checked — ${data.processed ?? 0} replies processed`);
    } catch (e) {
      const message = getErrorMessage(e, "Inbox poll failed");
      pushLog({ kind: "error", title: "Inbox poll failed", detail: message });
      toast.error(message);
    } finally {
      setCheckingInbox(false);
    }
  }

  function pushLog(entry: Omit<LogEntry, "id" | "timestamp">) {
    setLog((prev) => [
      { id: crypto.randomUUID(), timestamp: new Date().toISOString(), ...entry },
      ...prev,
    ]);
  }

  async function handleSendOne() {
    if (sending) return;
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-test-email", {
        body: { scenarioKey },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error ?? "Send failed");
      setLastLeadId(data.leadId);
      setLastBusinessName(data.scenario);
      pushLog({
        kind: "send",
        title: `Sent → ${data.scenario}`,
        detail: data.subject,
        data,
      });
      toast.success(`Test email sent to inbox for ${data.scenario}`);
    } catch (e) {
      const message = getErrorMessage(e, "Send failed");
      pushLog({ kind: "error", title: "Send failed", detail: message });
      toast.error(message);
    } finally {
      setSending(false);
    }
  }

  async function handleSimulateReply() {
    if (classifying || !replyText.trim()) return;

    // Per spec: attribute the simulated reply to the LAST test email sent.
    let leadId = lastLeadId;
    let businessName = lastBusinessName;

    // Fallback: if nothing has been sent in this session, use the dropdown
    // selection so the page is still usable after a refresh.
    if (!leadId) {
      const scenarioLabel =
        SCENARIOS.find((s) => s.key === scenarioKey)?.label ?? scenarioKey;
      const fallbackName = scenarioLabel.split(" — ")[0];
      const { data: existing } = await supabase
        .from("leads")
        .select("id, business_name")
        .eq("business_name", fallbackName)
        .maybeSingle();
      leadId = existing?.id ?? null;
      businessName = existing?.business_name ?? fallbackName;
    }

    if (!leadId) {
      toast.error("Send a test email first so the reply can be attributed to a lead.");
      return;
    }

    setClassifying(true);
    try {
      pushLog({
        kind: "info",
        title: `Reply submitted → ${businessName ?? "lead"}`,
        detail: `"${replyText.slice(0, 80)}${replyText.length > 80 ? "…" : ""}"`,
      });

      // STEP 1 — classify-and-notify
      pushLog({ kind: "info", title: "Step 1 — classify-and-notify", detail: "Calling Claude…" });
      const { data: classifyData, error: classifyErr } = await supabase.functions.invoke(
        "classify-and-notify",
        { body: { replyText, businessName, leadId } },
      );
      if (classifyErr) throw new Error(`classify-and-notify: ${classifyErr.message}`);
      if (!classifyData?.success) throw new Error(`classify-and-notify: ${classifyData?.error ?? "failed"}`);

      const intent: "YES" | "NO" | "MAYBE" = classifyData.intent ?? "MAYBE";
      pushLog({
        kind: "classify",
        title: `Classified → ${intent}`,
        detail: `Claude model: ${classifyData.model ?? "unknown"}`,
        data: { ...classifyData, intent },
      });

      if (intent === "YES") {
        // STEP 2 — generate-mock (only on YES; the realtime subscription
        // will surface the popup independently). Fetch lead context first.
        const { data: leadRow } = await supabase
          .from("leads")
          .select("business_name,niche,city,state,county,phone,site_audit_json")
          .eq("id", leadId)
          .single();
        pushLog({ kind: "info", title: "Step 2 — generate-mock", detail: "Building mock site…" });
        const { data: mockData, error: mockErr } = await supabase.functions.invoke(
          "generate-mock",
          {
            body: {
              leadId,
              businessName: leadRow?.business_name ?? businessName,
              niche: leadRow?.niche ?? null,
              city: leadRow?.city ?? null,
              state: leadRow?.state ?? null,
              county: leadRow?.county ?? null,
              phone: leadRow?.phone ?? null,
              reviewCount: (leadRow?.site_audit_json as { review_count?: number } | null)?.review_count ?? null,
              rating: (leadRow?.site_audit_json as { rating?: number } | null)?.rating ?? null,
            },
          },
        );
        if (mockErr) throw new Error(`generate-mock: ${mockErr.message}`);
        if (!mockData?.success) throw new Error(`generate-mock: ${mockData?.error ?? "failed"}`);
        pushLog({
          kind: "info",
          title: "Mock site generated",
          detail: mockData.url,
          data: mockData,
        });

        // Belt-and-braces: also push the popup locally in case realtime is slow.
        if (classifyData.notificationId) {
          const { data: notif } = await supabase
            .from("notifications")
            .select("*")
            .eq("id", classifyData.notificationId)
            .single();
          if (notif) showNow(notif as YesNotification);
        }
        toast.success(`YES — popup incoming for ${businessName}.`);
      } else if (intent === "NO") {
        toast(`${businessName} replied not interested. Lead archived.`, {
          style: { background: "#2a2a2a", color: "#cfcfcf", border: "1px solid #3a3a3a" },
        });
      } else {
        toast(`MAYBE — routed to Replies tab as Needs Response.`, {
          style: { background: "#0c2a44", color: "#a8d4ff", border: "1px solid #1d4a78" },
        });
      }

      setReplyText("");
    } catch (e) {
      const message = getErrorMessage(e, "Simulate reply failed");
      pushLog({ kind: "error", title: "Simulate reply failed", detail: message });
      toast.error(message);
    } finally {
      setClassifying(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-[1100px] mx-auto px-6 py-8">
        <header className="mb-6">
          <h1 className="text-xl font-semibold">Email Generation Test</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Pick a test business, send one cold email, then simulate a reply to test the YES / NO / MAYBE flow.
          </p>
        </header>

        {/* Send one test email */}
        <section className="rounded-lg border border-border bg-card p-4 mb-4">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-3">
            1. Send one test email
          </div>
          <div className="flex flex-col md:flex-row gap-3">
            <select
              value={scenarioKey}
              onChange={(e) => setScenarioKey(e.target.value)}
              className="flex-1 rounded-md bg-background border border-border px-3 py-2 text-sm"
            >
              {SCENARIOS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
            <button
              onClick={handleSendOne}
              disabled={sending}
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {sending ? "Sending…" : "Send Test Email"}
            </button>
          </div>
        </section>

        {/* Simulate reply */}
        <section className="rounded-lg border border-border bg-card p-4 mb-4">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-3">
            2. Simulate a reply (classified by Claude)
          </div>
          <div className="flex flex-col md:flex-row gap-3">
            <input
              type="text"
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder='Type a reply, e.g. "yeah sounds good" or "not interested"'
              className="flex-1 rounded-md bg-background border border-border px-3 py-2 text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSimulateReply();
              }}
            />
            <button
              onClick={handleSimulateReply}
              disabled={classifying || !replyText.trim()}
              className="px-4 py-2 rounded-md border border-border text-sm font-medium hover:bg-card-foreground/5 disabled:opacity-50"
            >
              {classifying ? "Classifying…" : "Simulate Reply"}
            </button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Simulated replies are queued against the most recent test email and processed by Claude.
          </p>
        </section>

        {/* Check Gmail inbox */}
        <section className="rounded-lg border border-border bg-card p-4 mb-6">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-3">
            3. Check real Gmail inbox
          </div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Polls b.h.weboutreach@gmail.com via IMAP, classifies unread replies with Claude, and dispatches notifications. Manual trigger only.
            </p>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={handleTestWebhook}
                disabled={testingWebhook}
                className="px-4 py-2 rounded-md border border-border text-sm font-medium hover:bg-card-foreground/5 disabled:opacity-50"
              >
                {testingWebhook ? "Posting…" : "Test Webhook"}
              </button>
              <button
                onClick={handleCheckInbox}
                disabled={checkingInbox}
                className="px-4 py-2 rounded-md border border-border text-sm font-medium hover:bg-card-foreground/5 disabled:opacity-50"
              >
                {checkingInbox ? "Checking…" : "Check Inbox"}
              </button>
            </div>
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
              {it.detail && (
                <p className="text-sm text-foreground/80 mt-1">{it.detail}</p>
              )}
              {it.data?.body && (
                <pre className="text-sm whitespace-pre-wrap font-sans text-foreground/90 bg-background/50 rounded p-3 border border-border/50 mt-3">
                  {it.data.body}
                </pre>
              )}
              {it.data?.intent && (
                <div className="mt-2 text-xs text-muted-foreground">
                  raw: {it.data.rawClassification} · model: {it.data.model}
                </div>
              )}
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

function Badge({ kind }: { kind: LogEntry["kind"] }) {
  const map: Record<LogEntry["kind"], { label: string; color: string; bg: string }> = {
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
