import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SectionLabel } from "@/components/SectionLabel";
import { EmptyState } from "@/components/EmptyState";
import { Chip } from "@/components/Chip";
import { Badge } from "@/components/Badge";
import { fmtRelative } from "@/lib/format";
import { toast } from "sonner";

type Lead = {
  id: string;
  business_name: string;
  niche: string | null;
  city: string | null;
  state: string | null;
  county: string | null;
  email: string | null;
  status: string;
  outreach_count: number;
  last_contacted: string | null;
  archived: boolean;
};

function daysSince(iso: string | null): number {
  if (!iso) return 0;
  const ms = Date.now() - new Date(iso).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function useFollowUps() {
  return useQuery({
    queryKey: ["follow-ups"],
    queryFn: async () => {
      const [{ data: settings }, { data: leads }, { data: replies }] = await Promise.all([
        supabase.from("settings").select("followup_days").eq("id", 1).single(),
        supabase
          .from("leads")
          .select("*")
          .eq("status", "contacted")
          .eq("archived", false)
          .not("last_contacted", "is", null)
          .order("last_contacted", { ascending: true })
          .limit(500),
        supabase.from("replies").select("lead_id"),
      ]);
      const followupDays: number[] = (settings?.followup_days as number[]) ?? [4, 9, 18];
      const repliedSet = new Set((replies ?? []).map((r: any) => r.lead_id).filter(Boolean));
      const minDay = Math.min(...followupDays);

      const eligible = (leads ?? [])
        .filter((l: any) => !repliedSet.has(l.id))
        .map((l: any) => {
          const d = daysSince(l.last_contacted);
          // sequence_number bump from outreach_count: 1 sent => due for followup #1 etc.
          const dueWindow = followupDays.find((f) => d >= f && d < f + 365);
          return { ...l, days_since: d, due_window: dueWindow };
        })
        .filter((l: any) => l.days_since >= minDay && l.due_window != null) as (Lead & {
          days_since: number;
          due_window: number;
        })[];

      return eligible;
    },
    refetchInterval: 30000,
  });
}

export function FollowUpsView() {
  const { data, isLoading, refetch } = useFollowUps();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { subject: string; body: string }>>({});

  async function draft(leadId: string) {
    setBusyId(leadId);
    try {
      const { data, error } = await supabase.functions.invoke("draft-followup", {
        body: { leadId },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error ?? "Draft failed");
      setDrafts((p) => ({ ...p, [leadId]: { subject: data.subject, body: data.draft } }));
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to draft");
    } finally {
      setBusyId(null);
    }
  }

  async function send(leadId: string) {
    const d = drafts[leadId];
    if (!d) return;
    setBusyId(leadId);
    try {
      const { data, error } = await supabase.functions.invoke("send-followup", {
        body: { leadId, draft: d.body, subject: d.subject },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error ?? "Send failed");
      toast.success(data.delivered ? "Follow-up sent" : "Follow-up queued (sending disabled)");
      setDrafts((p) => {
        const n = { ...p };
        delete n[leadId];
        return n;
      });
      refetch();
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
          {data.map((lead) => {
            const d = drafts[lead.id];
            return (
              <div
                key={lead.id}
                className="rounded-lg p-4"
                style={{ backgroundColor: "#1a1830", border: "1px solid #2a2545", color: "#e2e0da" }}
              >
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-semibold">{lead.business_name}</span>
                      <Badge tone="amber">Day {lead.days_since}</Badge>
                      <Chip>#{lead.outreach_count + 1} follow-up</Chip>
                    </div>
                    <div className="text-xs opacity-70">
                      {lead.niche} · {lead.city}, {lead.state} · {lead.email ?? "no email"} · last contacted{" "}
                      {fmtRelative(lead.last_contacted)}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {!d && (
                      <button
                        onClick={() => draft(lead.id)}
                        disabled={busyId === lead.id}
                        className="btn-primary"
                      >
                        {busyId === lead.id ? "Drafting…" : "Draft follow-up"}
                      </button>
                    )}
                    {d && (
                      <button
                        onClick={() => send(lead.id)}
                        disabled={busyId === lead.id}
                        className="btn-primary"
                      >
                        {busyId === lead.id ? "Sending…" : "Send follow-up"}
                      </button>
                    )}
                  </div>
                </div>

                {d && (
                  <div className="mt-3 space-y-2">
                    <input
                      value={d.subject}
                      onChange={(e) =>
                        setDrafts((p) => ({ ...p, [lead.id]: { ...d, subject: e.target.value } }))
                      }
                      className="w-full rounded-md px-3 py-2 text-sm"
                      style={{ backgroundColor: "#0e0c1c", border: "1px solid #2a2545", color: "#e2e0da" }}
                    />
                    <textarea
                      value={d.body}
                      onChange={(e) =>
                        setDrafts((p) => ({ ...p, [lead.id]: { ...d, body: e.target.value } }))
                      }
                      rows={8}
                      className="w-full rounded-md px-3 py-2 text-sm font-sans resize-y"
                      style={{ backgroundColor: "#0e0c1c", border: "1px solid #2a2545", color: "#e2e0da" }}
                    />
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
