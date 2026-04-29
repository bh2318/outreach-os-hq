import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SectionLabel } from "@/components/SectionLabel";
import { EmptyState } from "@/components/EmptyState";
import { PriorityCard } from "@/components/PriorityCard";
import { Badge } from "@/components/Badge";
import { Chip } from "@/components/Chip";
import { fmtRelative, type StatusTone } from "@/lib/format";
import { logActivity } from "@/lib/activity";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Lead = {
  id: string;
  business_name: string;
  niche: string | null;
  city: string | null;
  state: string | null;
  county: string | null;
  email: string | null;
  phone: string | null;
  website_url: string | null;
  site_score: number | null;
  status: string;
  outreach_count: number;
  archived: boolean;
  created_at: string;
};

function priorityScore(l: Lead): number {
  // No website wins. Otherwise lower site_score wins.
  if (!l.website_url || l.site_score == null) return 100;
  return Math.max(0, 100 - l.site_score);
}

function siteBadge(l: Lead): { tone: StatusTone; label: string } {
  if (!l.website_url || l.site_score == null) return { tone: "green", label: "No website" };
  const s = l.site_score;
  if (s < 30) return { tone: "red", label: `Score ${s}` };
  if (s <= 55) return { tone: "amber", label: `Score ${s}` };
  return { tone: "gray", label: `Score ${s}` };
}

function useLeadsQueue() {
  return useQuery({
    queryKey: ["leads-queue"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .eq("status", "new")
        .eq("outreach_count", 0)
        .eq("archived", false)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as Lead[];
    },
    refetchInterval: 15000,
  });
}

type FilterId = "all" | "no_site" | "below_30" | "30_55";

const FILTERS: { id: FilterId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "no_site", label: "No website" },
  { id: "below_30", label: "Score below 30" },
  { id: "30_55", label: "Score 30 to 55" },
];

export function LeadsView() {
  const { data, isLoading } = useLeadsQueue();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<FilterId>("all");
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data ?? [])
      .filter((l) => {
        if (filter === "no_site") return !l.website_url || l.site_score == null;
        if (filter === "below_30") return l.site_score != null && l.site_score < 30;
        if (filter === "30_55") return l.site_score != null && l.site_score >= 30 && l.site_score <= 55;
        return true;
      })
      .filter((l) => {
        if (!term) return true;
        return (
          l.business_name?.toLowerCase().includes(term) ||
          l.city?.toLowerCase().includes(term)
        );
      })
      .sort((a, b) => priorityScore(b) - priorityScore(a));
  }, [data, filter, search]);

  async function sendOutreach(lead: Lead) {
    setBusyId(lead.id);
    try {
      const { data: res, error } = await supabase.functions.invoke("send-outreach-to-lead", {
        body: { leadId: lead.id },
      });
      if (error) throw error;
      if (!res?.success) throw new Error(res?.error ?? "Send failed");
      toast.success(`Outreach sent to ${lead.business_name}`);
      qc.invalidateQueries();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to send outreach");
    } finally {
      setBusyId(null);
    }
  }

  async function archive(lead: Lead) {
    setBusyId(lead.id);
    try {
      const { error } = await supabase
        .from("leads")
        .update({ archived: true, status: "archived" })
        .eq("id", lead.id);
      if (error) throw error;
      await logActivity({
        action_type: "system",
        business_name: lead.business_name,
        lead_id: lead.id,
        detail: "Lead archived from queue",
        outcome: "warning",
      });
      toast.success("Lead archived");
      qc.invalidateQueries();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to archive");
    } finally {
      setBusyId(null);
    }
  }

  const total = data?.length ?? 0;

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <SectionLabel>Lead queue</SectionLabel>
        <span className="text-[11px] text-muted-foreground font-mono">{total} leads</span>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              "text-[10px] px-2.5 py-1 rounded-full border transition-colors",
              filter === f.id
                ? "bg-primary-fill border-primary-fill-border text-primary-fill-text"
                : "border-border text-muted-foreground hover:bg-border"
            )}
          >
            {f.label}
          </button>
        ))}
        <input
          className="input-base ml-auto"
          style={{ minWidth: 220 }}
          placeholder="Search business name or city…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? null : !filtered.length ? (
        <EmptyState>No leads match your filter.</EmptyState>
      ) : (
        <div className="space-y-2">
          {filtered.map((lead) => {
            const sb = siteBadge(lead);
            return (
              <PriorityCard
                key={lead.id}
                tone="blue"
                title={<span className="text-foreground">{lead.business_name}</span>}
                subtitle={`${lead.niche ?? "—"} · ${lead.city ?? "—"}${lead.state ? `, ${lead.state}` : ""}`}
                chips={
                  <>
                    <Badge tone={sb.tone}>{sb.label}</Badge>
                    {lead.phone && <Chip>{lead.phone}</Chip>}
                    <Chip>Scraped {fmtRelative(lead.created_at)}</Chip>
                  </>
                }
                actions={
                  <>
                    <button
                      className="btn-primary"
                      disabled={busyId === lead.id}
                      onClick={() => sendOutreach(lead)}
                    >
                      {busyId === lead.id ? "Sending…" : "Send outreach"}
                    </button>
                    <button
                      className="btn-ghost"
                      disabled={busyId === lead.id}
                      onClick={() => archive(lead)}
                    >
                      Archive
                    </button>
                  </>
                }
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
