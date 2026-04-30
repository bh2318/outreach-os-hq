import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SectionLabel } from "@/components/SectionLabel";
import { EmptyState } from "@/components/EmptyState";
import { PriorityCard } from "@/components/PriorityCard";
import { Badge } from "@/components/Badge";
import { Chip } from "@/components/Chip";
import { fmtRelative, type StatusTone } from "@/lib/format";
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
  // joined lead
  leads?: {
    niche: string | null;
    city: string | null;
    state: string | null;
    last_contacted: string | null;
  } | null;
};

function urgencyTone(seq: number): { tone: StatusTone; label: string } {
  // sequence_number: 2 = first follow-up (day 4), 3 = second (day 9), 4 = final (day 18)
  if (seq >= 4) return { tone: "red", label: "Final follow-up — day 18" };
  if (seq === 3) return { tone: "amber", label: "Day 9 follow-up" };
  return { tone: "amber", label: "Day 4 follow-up" };
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
      // Mark queue row as sent
      await supabase
        .from("followup_queue")
        .update({ sent: true, sent_at: new Date().toISOString() })
        .eq("id", row.id);
      // Final follow-up (sequence 4 = day 18) closes out the lead.
      if (row.sequence_number >= 4) {
        await supabase.from("leads").update({ status: "follow-up-complete" }).eq("id", row.lead_id);
      }
      toast.success(res.delivered ? "Follow-up sent" : "Follow-up queued (sending disabled)");
      setOpenId(null);
      qc.invalidateQueries();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to send");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <SectionLabel>Follow-ups due</SectionLabel>
      {isLoading ? null : !data?.length ? (
        <EmptyState>No follow-ups due right now.</EmptyState>
      ) : (
        <div className="space-y-2">
          {data.map((row) => {
            const u = urgencyTone(row.sequence_number);
            const isOpen = openId === row.id;
            const draft = getDraft(row);
            const lead = row.leads;
            return (
              <div key={row.id}>
                <PriorityCard
                  tone={u.tone}
                  title={<span className="text-foreground">{row.business_name}</span>}
                  subtitle={`${lead?.niche ?? "—"} · ${lead?.city ?? "—"}${lead?.state ? `, ${lead.state}` : ""}`}
                  chips={
                    <>
                      <Chip>#{row.sequence_number - 1} follow-up</Chip>
                      {lead?.last_contacted && <Chip>Last contacted {fmtRelative(lead.last_contacted)}</Chip>}
                      <Chip>Due {row.due_date}</Chip>
                    </>
                  }
                  badge={<Badge tone={u.tone}>{u.label}</Badge>}
                  actions={
                    <button
                      className="btn-primary"
                      disabled={busyId === row.id}
                      onClick={() => setOpenId(isOpen ? null : row.id)}
                    >
                      {isOpen ? "Hide draft" : "Generate and send"}
                    </button>
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
                        {busyId === row.id ? "Sending…" : "Send follow-up"}
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
