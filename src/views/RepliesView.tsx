import { useMemo, useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
  group: "info_received" | "maybe" | "contract" | "no" | "stop";
  tone: StatusTone;
  badge: string;
  instruction: string;
  sortKey: number;
  draftFn: string | null;
  sendFn: string;
  hideDraft?: boolean;
  directToMock?: boolean;
};

function intentMeta(r: Reply): IntentMeta {
  const intent = r.intent ?? "unknown";
  const body = (r.body ?? "").toLowerCase();
  const looksLikeContract =
    /(signed|signature|agreement|contract)/.test(body) && r.lead_id;

  if (intent === "unsubscribe") {
    return {
      group: "stop", tone: "gray", badge: "Unsubscribed",
      instruction: "This contact has been removed from all outreach permanently.",
      sortKey: 5, draftFn: null, sendFn: "", hideDraft: true,
    };
  }

  if (looksLikeContract && (intent === "interested" || intent === "needs_response")) {
    return {
      group: "contract", tone: "green", badge: "Agreement received",
      instruction: "Signed agreement received — pipeline has been advanced. Begin building their site.",
      sortKey: 0, draftFn: null, sendFn: "", hideDraft: true,
    };
  }

  if (intent === "info_received") {
    return {
      group: "info_received", tone: "green", badge: "Info received",
      instruction: "They sent their business information. Review what they shared below, then move them to Mock Studio to build their preview.",
      sortKey: 1, draftFn: null, sendFn: "", hideDraft: true, directToMock: true,
    };
  }

  if (intent === "needs_response" || intent === "unknown") {
    return {
      group: "maybe", tone: "blue", badge: "Question",
      instruction: "They have a question before moving forward. Review the response below, make sure it addresses their concern, and confirm when ready.",
      sortKey: 2, draftFn: "draft-maybe-response", sendFn: "send-maybe-response",
    };
  }

  return {
    group: "no", tone: "gray", badge: "Not interested",
    instruction: "",
    sortKey: 4, draftFn: null, sendFn: "", hideDraft: true,
  };
}

function getReplyTimeLabel(reply: Reply): { label: string; isHot: boolean } {
  const outreachTime = reply.leads?.last_contacted;
  const replyTime = reply.received_at;
  if (!outreachTime || !replyTime) return { label: "", isHot: false };
  const diffMs = new Date(replyTime).getTime() - new Date(outreachTime).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const isHot = diffMins <= 120;
  if (diffMins < 60) return { label: `Replied ${diffMins}m after outreach`, isHot };
  if (diffMins < 1440) return { label: `Replied ${Math.floor(diffMins / 60)}h after outreach`, isHot };
  return { label: `Replied ${Math.floor(diffMins / 1440)}d after outreach`, isHot };
}

function ReplyRow({ reply, onDismiss }: { reply: Reply; onDismiss: (id: string) => void }) {
  const m = useMemo(() => intentMeta(reply), [reply]);
  const lead = reply.leads;
  const [draft, setDraft] = useState<string>(reply.draft_response ?? "");
  const [subject, setSubject] = useState<string>(
    reply.draft_subject ?? `Re: ${lead?.business_name ?? ""}`
  );
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const { label: replyTimeLabel, isHot } = getReplyTimeLabel(reply);

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
          await supabase
            .from("replies")
            .update({ draft_response: d, draft_subject: subj ?? subject })
            .eq("id", reply.id);
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setGenerating(false);
      }
    })();
    return () => { cancelled = true; };
  }, [reply.id]);

  async function archive() {
    setBusy(true);
    try {
      await supabase
        .from("replies")
        .update({ archived: true, actioned: true })
        .eq("id", reply.id);
      await logActivity({
        action_type: "replied",
        business_name: lead?.business_name,
        detail: "Reply archived",
        outcome: "warning",
        lead_id: reply.lead_id,
      });
      toast.success("Archived");
      onDismiss(reply.id);
    } finally {
      setBusy(false);
    }
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
      await supabase
        .from("notifications")
        .update({ acted_on: true, read: true, status: "acted" })
        .eq("lead_id", reply.lead_id)
        .eq("acted_on", false);
      await logActivity({
        action_type: "replied",
        business_name: lead?.business_name,
        detail: "Sent MAYBE response",
        outcome: "success",
        lead_id: reply.lead_id,
      });
      toast.success("Sent");
      onDismiss(reply.id);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to send");
    } finally {
      setBusy(false);
    }
  }

  async function moveToMockStudio() {
    setBusy(true);
    try {
      await supabase
        .from("leads")
        .update({ status: "mock-requested" })
        .eq("id", reply.lead_id);

      const { data: existingMock } = await supabase
        .from("mock_sites")
        .select("id")
        .eq("lead_id", reply.lead_id)
        .maybeSingle();

      if (!existingMock) {
        await supabase.from("mock_sites").insert({
          lead_id: reply.lead_id,
          status: "not-generated",
          requested_at: new Date().toISOString(),
        });
      }

      await supabase
        .from("replies")
        .update({ actioned: true })
        .eq("id", reply.id);

      await supabase
        .from("notifications")
        .update({ acted_on: true, read: true, status: "acted" })
        .eq("lead_id", reply.lead_id)
        .eq("acted_on", false);

      await logActivity({
        action_type: "mock_requested",
        business_name: lead?.business_name,
        detail: "Moved to Mock Studio",
        outcome: "success",
        lead_id: reply.lead_id,
      });

      toast.success("Moved to Mock Studio");
      onDismiss(reply.id);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to move to Mock Studio");
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

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="text-[15px] font-bold text-foreground truncate">
            {lead?.business_name ?? reply.from_email ?? "Unknown"}
          </div>
          {isHot && <span title="Replied within 2 hours — high intent">🔥</span>}
        </div>
        <Badge tone={m.tone}>{m.badge}</Badge>
      </div>

      <div className="text-[11px] text-muted-foreground mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
        <span>{reply.from_email}</span>
        {lead?.niche && <><span className="text-faint">·</span><span>{lead.niche}</span></>}
        {lead?.city && <><span className="text-faint">·</span><span>{lead.city}</span></>}
        {lead?.phone && <><span className="text-faint">·</span><span>{lead.phone}</span></>}
        <span className="text-faint">·</span>
        <span>{fmtRelative(reply.received_at)}</span>
        {replyTimeLabel && (
          <>
            <span className="text-faint">·</span>
            <span className={isHot ? "text-status-amber-text font-medium" : ""}>{replyTimeLabel}</span>
          </>
        )}
      </div>

      <div className="mt-3 rounded-md border border-border-faint bg-background/60 px-3 py-2.5 text-[12px] text-foreground whitespace-pre-wrap leading-relaxed">
        {reply.body || <span className="text-faint italic">(empty)</span>}
      </div>

      <div className={cn("mt-3 text-[12px] font-medium", accentText[m.tone])}>
        {m.instruction}
      </div>

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

      <div className="mt-3 flex items-center gap-2 flex-wrap">
        {m.group === "stop" || m.group === "no" ? (
          <button className="btn-ghost" onClick={archive} disabled={busy}>Archive</button>
        ) : m.group === "contract" ? (
          <button className="btn-ghost" onClick={archive} disabled={busy}>Archive</button>
        ) : m.directToMock ? (
          <>
            <button
              className="bg-primary hover:bg-primary-hover text-primary-foreground rounded-md px-3 py-1.5 text-[11px] font-medium disabled:opacity-50"
              onClick={moveToMockStudio}
              disabled={busy}
            >
              {busy ? "Moving…" : "Move to Mock Studio"}
            </button>
            <button className="btn-ghost ml-auto" onClick={archive} disabled={busy}>Archive</button>
          </>
        ) : (
          <>
            <button className="btn-ghost" onClick={() => setEditing((e) => !e)} disabled={busy}>
              {editing ? "Lock draft" : "Edit draft"}
            </button>
            <button
              className="bg-primary hover:bg-primary-hover text-primary-foreground rounded-md px-3 py-1.5 text-[11px] font-medium disabled:opacity-50"
              onClick={confirmAndSend}
              disabled={busy || generating || !draft.trim()}
            >
              {busy ? "Sending…" : "Confirm and send"}
            </button>
            <button className="btn-ghost ml-auto" onClick={archive} disabled={busy}>Archive</button>
          </>
        )}
      </div>
    </div>
  );
}

export function RepliesView() {
  const { data, isLoading } = useReplies();
  const qc = useQueryClient();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    const channel = supabase
      .channel("replies-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "replies" },
        () => qc.invalidateQueries({ queryKey: ["replies"] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc]);

  function onDismiss(id: string) {
    setDismissed((prev) => new Set([...prev, id]));
  }

  const sorted = useMemo(() => {
    return [...(data ?? [])]
      .filter((r: Reply) => {
        if (dismissed.has(r.id)) return false;
        if (r.actioned) return false;
        if (r.archived) return false;
        const m = intentMeta(r);
        if (m.group === "no" || m.group === "stop") return false;
        if (r.intent === "website_lead") return false;
        if (r.intent === "interested") return false;
        return true;
      })
      .sort((a: Reply, b: Reply) => {
        const sa = intentMeta(a).sortKey;
        const sb = intentMeta(b).sortKey;
        if (sa !== sb) return sa - sb;
        return new Date(b.received_at).getTime() - new Date(a.received_at).getTime();
      });
  }, [data, dismissed]);

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
          {sorted.map((r) => <ReplyRow key={r.id} reply={r} onDismiss={onDismiss} />)}
        </div>
      )}
    </div>
  );
}
