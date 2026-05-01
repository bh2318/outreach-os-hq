import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SectionLabel } from "@/components/SectionLabel";
import { EmptyState } from "@/components/EmptyState";
import { PriorityCard } from "@/components/PriorityCard";
import { Badge } from "@/components/Badge";
import { Chip } from "@/components/Chip";
import { type StatusTone } from "@/lib/format";
import { toast } from "sonner";

type FollowupRow = {
  id: string;
  lead_id: string;
  business_name: string;
  sequence_number: number;
  draft_subject: string | null;
  draft_body: string | null;
  due_date: string;
  sent: boolean;
  created_at: string;
  leads?: {
    niche: string | null;
    city: string | null;
    state: string | null;
    last_contacted: string | null;
  } | null;
};

function urgencyTone(seq: number): { tone: StatusTone; label: string } {
  if (seq >= 4) return { tone: "red", label: "Final follow-up — day 18" };
  if (seq === 3) return { tone: "amber", label: "Day 9 follow-up" };
  return { tone: "amber", label: "Day 4 follow-up" };
}

function daysSince(iso: string | null) {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

function useFollowupQueue() {
  return useQuery({
    queryKey: ["followup-queue"],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("followup_queue")
        .select("*")
        .eq("sent", false)
        .eq("archived", false)
        .lte("due_date", today)
        .order("sequence_number", { ascending: false })
        .order("due_date", { ascending: true });
      if (error) throw error;
      const rows = (data ?? []) as Omit<FollowupRow, "leads">[];
      const ids = Array.from(new Set(rows.map((r) => r.lead_id))).filter(Boolean);
      let leadsById: Record<string, FollowupRow["leads"]> = {};
      if (ids.length) {
        const { data: leadRows } = await supabase
          .from("leads")
          .select("id, niche, city, state, last_contacted")
          .in("id", ids);
        for (const l of leadRows ?? []) {
          leadsById[(l as any).id] = {
            niche: (l as any).niche,
            city: (l as any).city,
            state: (l as any).state,
            last_contacted: (l as any).last_contacted,
          };
        }
      }
      return rows.map((r) => ({ ...r, leads: leadsById[r.lead_id] ?? null })) as FollowupRow[];
    },
    refetchInterval: 30000,
  });
}

export function FollowUpsView() {
  const { data, isLoading } = useFollowupQueue();
  const qc = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, { subject: string; body: string }>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  function getDraft(row: FollowupRow) {
    return edits[row.id] ?? {
      subject: row.draft_subject ?? `Following up — ${row.business_name}`,
      body: row.draft_body ?? "",
    };
  }

  async function send(row: FollowupRow) {
    const d = getDraft(row);
    setBusyId(row.id);
    try {
      const { data: res, error } = await supabase.functions.invoke("send-followup", {
        body: { leadId: row.lead_id, draft: d.body, subject: d.subject },
      });
      if (error) throw error;
      if (!res?.success) throw new Error(res?.error ?? "Send failed");
      await supabase
        .from("followup_queue")
        .update({ sent: true, sent_at: new Date().toISOString() })
        .eq("id", row.id);
      if (row.sequence_number >= 4) {
        await supabase.from("leads").update({ status: "follow-up-complete" }).eq("id", row.lead_id);
      }
      toast.success("Follow-up sent");
      setOpenId(null);
      setDismissed((prev) => new Set([...prev, row.id]));
      qc.invalidateQueries();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to send");
    } finally {
      setBusyId(null);
    }
  }

  async function archiveRow(row: FollowupRow) {
    setBusyId(row.id);
    try {
      await supabase
        .from("followup_queue")
        .update({ archived: true })
        .eq("id", row.id);
      toast.success("Follow-up archived");
      setDismissed((prev) => new Set([...prev, row.id]));
      qc.invalidateQueries();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to archive");
    } finally {
      setBusyId(null);
    }
  }

  const visible = (data ?? []).filter((r) => !dismissed.has(r.id));

  return (
    <div>
      <SectionLabel>Follow-ups due</SectionLabel>
      {isLoading ? null : !visible.length ? (
        <EmptyState>
          No follow-ups due right now. Follow-ups appear here on days 4, 9, and 18 after outreach for leads that have not replied.
        </EmptyState>
      ) : (
        <div className="space-y-2">
          {visible.map((row) => {
            const u = urgencyTone(row.sequence_number);
            const isOpen = openId === row.id;
            const draft = getDraft(row);
            const lead = row.leads;
            const daysAgo = daysSince(lead?.last_contacted ?? null);
            return (
              <div key={row.id}>
                <PriorityCard
                  tone={u.tone}
                  title={<span className="text-foreground">{row.business_name}</span>}
                  subtitle={`${lead?.niche ?? "—"} · ${lead?.city ?? "—"}${lead?.state ? `, ${lead.state}` : ""}`}
                  chips={
                    <>
                      <Chip>Follow-up {row.sequence_number - 1} of 3</Chip>
                      {daysAgo !== null && (
                        <Chip>Outreach sent {daysAgo}d ago</Chip>
                      )}
                    </>
                  }
                  badge={<Badge tone={u.tone}>{u.label}</Badge>}
                  actions={
                    <div className="flex items-center gap-2">
                      <button
                        className="btn-primary"
                        disabled={busyId === row.id}
                        onClick={() => setOpenId(isOpen ? null : row.id)}
                      >
                        {isOpen ? "Hide draft" : "Review and send"}
                      </button>
                      <button
                        className="btn-ghost"
                        disabled={busyId === row.id}
                        onClick={() => archiveRow(row)}
                      >
                        Archive
                      </button>
                    </div>
                  }
                />
                {isOpen && (
                  <div className="surface-card mt-2 space-y-2">
                    <input
                      className="input-base w-full"
                      value={draft.subject}
                      onChange={(e) =>
                        setEdits((p) => ({ ...p, [row.id]: { ...draft, subject: e.target.value } }))
                      }
                    />
                    <textarea
                      className="input-base w-full font-sans resize-y"
                      rows={10}
                      value={draft.body}
                      onChange={(e) =>
                        setEdits((p) => ({ ...p, [row.id]: { ...draft, body: e.target.value } }))
                      }
                    />
                    <div className="flex justify-end gap-2">
                      <button className="btn-ghost" onClick={() => setOpenId(null)}>Cancel</button>
                      <button
                        className="btn-primary"
                        disabled={busyId === row.id || !draft.body.trim()}
                        onClick={() => send(row)}
                      >
                        {busyId === row.id ? "Sending…" : "Confirm and send"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
