import { useEffect, useMemo, useState } from "react";
import { useReplies } from "@/hooks/useData";
import { SectionLabel } from "@/components/SectionLabel";
import { EmptyState } from "@/components/EmptyState";
import { Badge } from "@/components/Badge";
import { supabase } from "@/integrations/supabase/client";
import { fmtRelative, type StatusTone } from "@/lib/format";
import { logActivity } from "@/lib/activity";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Reply = any;

type IntentMeta = {
  group: "yes" | "maybe" | "call" | "contract" | "no";
  tone: StatusTone;
  badge: string;
  instruction: string;
  sortKey: number;
  draftFn: string | null; // edge function for draft if missing
  sendFn: string;
  hideDraft?: boolean;
};

function intentMeta(r: Reply): IntentMeta {
  const intent = r.intent ?? "unknown";
  const body = (r.body ?? "").toLowerCase();
  const looksLikeContract = /signed|contract|agreement|sign/i.test(body) && r.lead_id;

  if (intent === "call_request") {
    return {
      group: "call", tone: "red", badge: "Call requested",
      instruction: "Schedule a call — contact them at the number above.",
      sortKey: 2, draftFn: "draft-yes-response", sendFn: "send-yes-response",
    };
  }
  if (looksLikeContract && (intent === "interested" || intent === "needs_response")) {
    return {
      group: "contract", tone: "green", badge: "Contract received",
      instruction: "Build their site — contract signed, proceed to development.",
      sortKey: 3, draftFn: null, sendFn: "send-yes-response",
    };
  }
  if (intent === "interested" || intent === "mock_request" || intent === "price_inquiry") {
    return {
      group: "yes", tone: "green", badge: "Interested",
      instruction: "Send creative input request — ask for logo, photos, and design preferences.",
      sortKey: 0, draftFn: "draft-yes-response", sendFn: "send-yes-response",
    };
  }
  if (intent === "needs_response" || intent === "unknown") {
    return {
      group: "maybe", tone: "blue", badge: "Question",
      instruction: "Answer their question — draft addresses their specific question.",
      sortKey: 1, draftFn: "draft-maybe-response", sendFn: "send-maybe-response",
    };
  }
  return {
    group: "no", tone: "gray", badge: "Not interested",
    instruction: "No action needed — archived automatically.",
    sortKey: 4, draftFn: null, sendFn: "", hideDraft: true,
  };
}

function ReplyRow({ reply }: { reply: Reply }) {
  const m = useMemo(() => intentMeta(reply), [reply]);
  const lead = reply.leads;
  const [draft, setDraft] = useState<string>(reply.draft_response ?? "");
  const [subject, setSubject] = useState<string>(reply.draft_subject ?? `Re: ${lead?.business_name ?? ""}`);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Backfill draft if missing
  useEffect(() => {
    if (m.hideDraft || draft || !m.draftFn) return;
    let cancelled = false;
    (async () => {
      setGenerating(true);
      try {
        const { data, error } = await supabase.functions.invoke(m.draftFn!, {
          body: { replyId: reply.id, leadId: reply.lead_id },
        });
        if (cancelled || error) return;
        const d = data?.draft ?? data?.body ?? "";
        const subj = data?.subject;
        if (d) {
          setDraft(d);
          if (subj) setSubject(subj);
          await supabase.from("replies").update({ draft_response: d, draft_subject: subj ?? subject }).eq("id", reply.id);
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setGenerating(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reply.id]);

  async function archive() {
    setBusy(true);
    try {
      await supabase.from("replies").update({ actioned: true }).eq("id", reply.id);
      await logActivity({
        action_type: "replied", business_name: lead?.business_name,
        detail: "Reply archived (not interested)", outcome: "warning", lead_id: reply.lead_id,
      });
      toast.success("Archived");
    } finally { setBusy(false); }
  }

  async function confirmAndSend() {
    if (!draft.trim()) return toast.error("Draft is empty");
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke(m.sendFn, {
        body: { leadId: reply.lead_id, replyId: reply.id, draft, subject },
      });
      if (error) throw error;
      if (data && data.success === false) throw new Error(data.error ?? "Send failed");
      await supabase.from("replies").update({ actioned: true }).eq("id", reply.id);
      // Mark related notification acted_on
      await supabase
        .from("notifications")
        .update({ acted_on: true, read: true, status: "acted", acted_at: new Date().toISOString() })
        .eq("lead_id", reply.lead_id)
        .eq("acted_on", false);
      await logActivity({
        action_type: "replied", business_name: lead?.business_name,
        detail: `Sent ${m.group.toUpperCase()} response`, outcome: "success", lead_id: reply.lead_id,
      });
      toast.success("Sent");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to send");
    } finally {
      setBusy(false);
    }
  }

  const accentText: Record<StatusTone, string> = {
    red: "text-status-red-text",
    amber: "text-status-amber-text",
    blue: "text-status-blue-text",
    green: "text-status-green-text",
    gray: "text-muted-foreground",
    purple: "text-primary-fill-text",
  };
  const barBg: Record<StatusTone, string> = {
    red: "bg-status-red-text",
    amber: "bg-status-amber-text",
    blue: "bg-status-blue-text",
    green: "bg-status-green-text",
    gray: "bg-subtle",
    purple: "bg-primary-hover",
  };

  return (
    <div className="surface-card relative">
      <div className={cn("priority-bar", barBg[m.tone])} />
      {/* Line 1 */}
      <div className="flex items-center justify-between gap-3">
        <div className="text-[15px] font-bold text-foreground truncate">{lead?.business_name ?? "Unknown"}</div>
        <Badge tone={m.tone}>{m.badge}</Badge>
      </div>
      {/* Line 2 */}
      <div className="text-[11px] text-muted-foreground mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
        <span>{lead?.niche ?? "—"}</span>
        <span className="text-faint">·</span>
        <span>{lead?.city ?? "—"}</span>
        {lead?.phone && <><span className="text-faint">·</span><span>{lead.phone}</span></>}
        <span className="text-faint">·</span>
        <span>{fmtRelative(reply.received_at)}</span>
      </div>
      {/* Line 3 — full reply text */}
      <div className="mt-3 rounded-md border border-border-faint bg-background/60 px-3 py-2.5 text-[12px] text-foreground whitespace-pre-wrap leading-relaxed">
        {reply.body || <span className="text-faint italic">(empty)</span>}
      </div>
      {/* Line 4 — instruction */}
      <div className={cn("mt-3 text-[12px] font-medium", accentText[m.tone])}>
        {m.instruction}
      </div>

      {/* Line 5 — draft */}
      {!m.hideDraft && (
        <div className="mt-3">
          <div className="label-uppercase mb-1.5">Pre-drafted response</div>
          <input
            className="input-base w-full mb-2"
            value={subject}
            disabled={!editing}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
          />
          <textarea
            className="input-base w-full min-h-[160px] leading-relaxed"
            value={draft}
            disabled={!editing}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={generating ? "Generating draft…" : "Draft will appear here"}
          />
        </div>
      )}

      {/* Line 6 — buttons */}
      <div className="mt-3 flex items-center gap-2">
        {m.group === "no" ? (
          <button className="btn-ghost" onClick={archive} disabled={busy}>Archive</button>
        ) : (
          <>
            <button
              className="btn-ghost"
              onClick={() => setEditing((e) => !e)}
              disabled={busy}
            >
              {editing ? "Lock draft" : "Edit draft"}
            </button>
            <button
              className="bg-primary hover:bg-primary-hover text-primary-foreground rounded-md px-3 py-1.5 text-[11px] font-medium disabled:opacity-50"
              onClick={confirmAndSend}
              disabled={busy || generating || !draft.trim()}
            >
              {busy ? "Sending…" : "Confirm and send"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function RepliesView() {
  const { data, isLoading } = useReplies();

  const sorted = useMemo(() => {
    return [...(data ?? [])]
      .filter((r: Reply) => !r.actioned)
      .sort((a: Reply, b: Reply) => {
        const sa = intentMeta(a).sortKey;
        const sb = intentMeta(b).sortKey;
        if (sa !== sb) return sa - sb;
        return new Date(b.received_at).getTime() - new Date(a.received_at).getTime();
      });
  }, [data]);

  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <SectionLabel>Replies needing action</SectionLabel>
        <span className="text-[11px] text-muted-foreground font-mono">{sorted.length} waiting</span>
      </div>
      {isLoading ? null : !sorted.length ? (
        <EmptyState>No replies waiting — the system is running.</EmptyState>
      ) : (
        <div className="space-y-3">
          {sorted.map((r) => <ReplyRow key={r.id} reply={r} />)}
        </div>
      )}
    </div>
  );
}
