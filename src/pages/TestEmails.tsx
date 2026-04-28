import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type FeedItem = {
  index: number;
  scenario: string;
  subject: string;
  body: string;
  fullEmail: string;
  wordCount: number;
  timestamp: string;
  delivered: boolean;
  error?: string;
};

const TOTAL = 10;
const INTERVAL_MS = 60_000;

export default function TestEmails() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [nextIn, setNextIn] = useState<number>(0);
  const indexRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const tickRef = useRef<number | null>(null);

  async function sendOne() {
    const i = indexRef.current;
    try {
      const { data, error } = await supabase.functions.invoke(
        "send-test-email",
        { body: { index: i } },
      );
      if (error) throw error;
      const d = data as any;
      setItems((prev) => [
        {
          index: i + 1,
          scenario: d?.scenario ?? "unknown",
          subject: d?.subject ?? "",
          body: d?.body ?? "",
          fullEmail: d?.fullEmail ?? "",
          wordCount: d?.wordCount ?? 0,
          timestamp: d?.timestamp ?? new Date().toISOString(),
          delivered: !!d?.delivered,
          error: d?.error,
        },
        ...prev,
      ]);
    } catch (e: any) {
      setItems((prev) => [
        {
          index: i + 1,
          scenario: "error",
          subject: "",
          body: "",
          fullEmail: "",
          wordCount: 0,
          timestamp: new Date().toISOString(),
          delivered: false,
          error: e?.message ?? String(e),
        },
        ...prev,
      ]);
    }
    indexRef.current = i + 1;
    if (indexRef.current >= TOTAL) {
      stop();
      setDone(true);
    } else {
      setNextIn(INTERVAL_MS / 1000);
    }
  }

  function start() {
    if (running) return;
    setRunning(true);
    setDone(false);
    setItems([]);
    indexRef.current = 0;
    setNextIn(0);
    // fire first immediately
    sendOne();
    timerRef.current = window.setInterval(sendOne, INTERVAL_MS);
    tickRef.current = window.setInterval(() => {
      setNextIn((n) => (n > 0 ? n - 1 : 0));
    }, 1000);
  }

  function stop() {
    setRunning(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }

  useEffect(() => () => stop(), []);

  const delivered = items.filter((i) => i.delivered).length;
  const failed = items.filter((i) => !i.delivered).length;
  const avgWords =
    items.length > 0
      ? Math.round(items.reduce((s, i) => s + i.wordCount, 0) / items.length)
      : 0;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-[1100px] mx-auto px-6 py-8">
        <header className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold">Email Generation Test</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Sends 1 Claude-generated outreach email per minute to b.hemminger18@gmail.com. Stops after {TOTAL}.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!running && !done && (
              <button
                onClick={start}
                className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
              >
                Start test run
              </button>
            )}
            {running && (
              <button
                onClick={stop}
                className="px-4 py-2 rounded-md border border-border text-sm font-medium hover:bg-card"
              >
                Stop
              </button>
            )}
            {done && (
              <button
                onClick={start}
                className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
              >
                Run again
              </button>
            )}
          </div>
        </header>

        <div className="grid grid-cols-4 gap-3 mb-6">
          <Stat label="Sent" value={`${items.length} / ${TOTAL}`} />
          <Stat label="Delivered" value={String(delivered)} />
          <Stat label="Failed" value={String(failed)} />
          <Stat
            label={running ? `Next in ${nextIn}s` : done ? "Complete" : "Idle"}
            value={avgWords ? `${avgWords} avg words` : "—"}
          />
        </div>

        {done && (
          <div className="mb-6 rounded-lg border border-border bg-card p-4">
            <h2 className="text-sm font-semibold mb-2">Run summary</h2>
            <p className="text-sm text-muted-foreground">
              Sent {items.length} emails. {delivered} delivered, {failed} failed. Average body length {avgWords} words.
            </p>
          </div>
        )}

        <div className="space-y-3">
          {items.length === 0 && (
            <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
              No emails yet. Click "Start test run".
            </div>
          )}
          {items.map((it) => (
            <article
              key={it.index}
              className="rounded-lg border border-border bg-card p-4"
            >
              <div className="flex items-start justify-between gap-4 mb-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-muted-foreground">
                      #{String(it.index).padStart(2, "0")}
                    </span>
                    <span className="text-sm font-semibold truncate">
                      {it.scenario}
                    </span>
                    {it.delivered ? (
                      <span className="inline-flex items-center gap-1 text-emerald-400 text-xs">
                        ✓ delivered
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-red-400 text-xs">
                        ✗ failed
                      </span>
                    )}
                  </div>
                  {it.subject && (
                    <p className="text-sm mt-1 truncate">
                      <span className="text-muted-foreground">Subject: </span>
                      {it.subject}
                    </p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs text-muted-foreground">
                    {new Date(it.timestamp).toLocaleTimeString()}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {it.wordCount} words
                  </div>
                </div>
              </div>
              {it.error && (
                <pre className="text-xs text-red-400 whitespace-pre-wrap mb-2">
                  {it.error}
                </pre>
              )}
              {it.body && (
                <pre className="text-sm whitespace-pre-wrap font-sans text-foreground/90 bg-background/50 rounded p-3 border border-border/50">
                  {it.body}
                </pre>
              )}
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-base font-semibold mt-1">{value}</div>
    </div>
  );
}
