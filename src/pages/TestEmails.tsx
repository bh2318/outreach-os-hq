import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type LogEntry = {
  id: string;
  kind: "send" | "classify" | "info" | "error" | "check";
  timestamp: string;
  title: string;
  detail?: string;
  data?: any;
};

const SCENARIOS = [
  { key: "mikes-plumbing", label: "Mike's Plumbing — Tacoma, WA" },
  { key: "green-thumb", label: "Green Thumb Landscaping — Olympia, WA" },
  { key: "peak-roofing", label: "Peak Roofing Co — Aberdeen, WA" },
  { key: "bright-clean", label: "Bright Clean Services — Centralia, WA" },
  { key: "sunrise-hvac", label: "Sunrise HVAC — Hoquiam, WA" },
];

export default function TestEmails() {
  const [scenarioKey, setScenarioKey] = useState(SCENARIOS[0].key);
  const [sending, setSending] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [classifying, setClassifying] = useState(false);
  const [checking, setChecking] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [lastLeadId, setLastLeadId] = useState<string | null>(null);
  const [lastBusinessName, setLastBusinessName] = useState<string | null>(null);

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
    } catch (e: any) {
      pushLog({ kind: "error", title: "Send failed", detail: e?.message ?? String(e) });
      toast.error(e?.message ?? "Send failed");
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
      // 1. Insert the inbound reply row.
      const { error: insErr } = await supabase.from("incoming_replies").insert({
        lead_id: leadId,
        reply_text: replyText,
      });
      if (insErr) throw insErr;

      pushLog({
        kind: "info",
        title: `Reply queued → ${businessName ?? "lead"}`,
        detail: `"${replyText.slice(0, 80)}${replyText.length > 80 ? "…" : ""}"`,
      });

      // 2. Trigger processing immediately.
      const { data, error } = await supabase.functions.invoke("process-reply", {});
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error ?? "process-reply failed");

      const mine = (data.results ?? []).find((r: any) => r.businessName === businessName) ?? data.results?.[0];
      const intent = mine?.intent ?? "?";

      pushLog({
        kind: "classify",
        title: `Classified → ${intent}`,
        detail: `${data.processed} reply(s) processed`,
        data: { ...data, intent },
      });

      if (intent === "YES") {
        toast.success(`YES — popup incoming for ${businessName}.`);
      } else if (intent === "NO") {
        toast(`${businessName} replied not interested. Lead archived.`, {
          style: { background: "#2a2a2a", color: "#cfcfcf", border: "1px solid #3a3a3a" },
        });
      } else {
        toast.message(`MAYBE — routed to Replies tab as Needs Response.`);
      }

      setReplyText("");
    } catch (e: any) {
      pushLog({ kind: "error", title: "Simulate reply failed", detail: e?.message ?? String(e) });
      toast.error(e?.message ?? "Simulate reply failed");
    } finally {
      setClassifying(false);
    }
  }

  async function handleCheckReplies() {
    if (checking) return;
    setChecking(true);
    try {
      const { data, error } = await supabase.functions.invoke("process-reply", {});
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error ?? "Check failed");
      pushLog({
        kind: "check",
        title: `Checked replies → ${data.processed} processed`,
        detail:
          (data.results ?? [])
            .map((r: any) => `${r.businessName ?? r.id}: ${r.intent ?? r.error}`)
            .join(" · ") || "No pending replies.",
        data,
      });
      toast.success(`Checked replies — ${data.processed} processed.`);
    } catch (e: any) {
      pushLog({ kind: "error", title: "Check replies failed", detail: e?.message ?? String(e) });
      toast.error(e?.message ?? "Check replies failed");
    } finally {
      setChecking(false);
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
        <section className="rounded-lg border border-border bg-card p-4 mb-6">
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
            Reply is attributed to the business currently selected above.
          </p>
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
