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
  email: string | null;
  phone: string | null;
  website_url: string | null;
  site_score: number | null;
  status: string;
  outreach_count: number;
  archived: boolean;
  created_at: string;
};

type FilterId = "all" | "phone_only";

function statusRank(l: Lead): number {
  if (l.archived || l.status === "archived") return 3;
  if (l.status === "new" && (l.site_score === null || !l.website_url || l.site_score >= 100)) return 0;
  if (l.status === "new") return 1;
  return 2;
}

function siteBadge(l: Lead): { tone: StatusTone; label: string } {
  if (!l.website_url || l.site_score == null) return { tone: "green", label: "No website" };
  const s = l.site_score;
  if (s < 30) return { tone: "red", label: `Score ${s}` };
  if (s <= 55) return { tone: "amber", label: `Score ${s}` };
  return { tone: "gray", label: `Score ${s}` };
}

function statusBadge(l: Lead): { tone: StatusTone; label: string } {
  if (l.archived || l.status === "archived") return { tone: "gray", label: "Archived" };
  if (l.status === "phone_only") return { tone: "amber", label: "Phone only" };
  if (l.status === "new") return { tone: "blue", label: "New" };
  if (l.status === "contacted") return { tone: "purple", label: "Contacted" };
  if (l.status === "mock_sent") return { tone: "amber", label: "Mock sent" };
  return { tone: "gray", label: l.status };
}

function useAllLeads() {
  return useQuery({
    queryKey: ["leads-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .eq("archived", false)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as Lead[];
    },
    refetchInterval: 30000,
  });
}

export function LeadsView() {
  const { data, isLoading } = useAllLeads();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterId>("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data ?? [])
      .filter((l) => {
        if (filter === "phone_only" && l.status !== "phone_only") return false;
        if (!term) return true;
        return (
          l.business_name?.toLowerCase().includes(term) ||
          l.city?.toLowerCase().includes(term) ||
          l.niche?.toLowerCase().includes(term)
        );
      })
      .sort((a, b) => {
        const ra = statusRank(a);
        const rb = statusRank(b);
        if (ra !== rb) return ra - rb;
        if (ra === 1) return (b.site_score ?? 0) - (a.site_score ?? 0);
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [data, search, filter]);

  async function archive(lead: Lead) {
    setBusyId(lead.id);
    try {
      const { error } = await supabase
        .from("leads")
        .update({ archived: true, archived_at: new Date().toISOString() })
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

  const queueCount = (data ?? []).filter((l) => !l.archived && l.status === "new").length;
  const phoneOnlyCount = (data ?? []).filter((l) => l.status === "phone_only").length;

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <SectionLabel>All leads</SectionLabel>
        <span className="text-[11px] text-muted-foreground font-mono">{queueCount} in queue</span>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button
          onClick={() => setFilter("all")}
          className={cn(
            "rounded-full px-3 py-1 text-[11px] border transition-colors",
            filter === "all"
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-transparent text-muted-foreground border-border hover:text-foreground",
          )}
        >
          All
        </button>
        <button
          onClick={() => setFilter("phone_only")}
          className={cn(
            "rounded-full px-3 py-1 text-[11px] border transition-colors inline-flex items-center gap-1.5",
            filter === "phone_only"
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-transparent text-muted-foreground border-border hover:text-foreground",
          )}
        >
          Phone Only
          {phoneOnlyCount > 0 && (
            <span className="font-mono text-[10px] opacity-80">{phoneOnlyCount}</span>
          )}
        </button>
        <input
          className="input-base ml-auto"
          style={{ minWidth: 240 }}
          placeholder="Search business name, city, or niche…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? null : !filtered.length ? (
        <EmptyState>
          {filter === "phone_only"
            ? "No phone-only leads right now. These appear when the scraper finds a business with no email or website."
            : "No leads in the database yet. The automated scraper will populate this list."}
        </EmptyState>
      ) : (
        <div className="space-y-2">
          {filtered.map((lead) => {
            if (lead.status === "phone_only") {
              return (
                <div key={lead.id} className="surface-card">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[14px] font-semibold text-foreground">
                          {lead.business_name}
                        </span>
                        <Badge tone="amber">Phone only</Badge>
                      </div>
                      <div className="mt-2 text-[22px] font-mono font-semibold text-foreground tracking-tight">
                        {lead.phone ?? "No phone on file"}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-1">
                        {lead.city ?? "—"}{lead.state ? `, ${lead.state}` : ""} · {lead.niche ?? "—"}
                      </div>
                      <div className="text-[11px] text-status-amber-text mt-1">
                        No email — call or text directly
                      </div>
                    </div>
                  </div>
                </div>
              );
            }
            const sb = siteBadge(lead);
            const stat = statusBadge(lead);
            const isArchived = lead.archived || lead.status === "archived";
            return (
              <PriorityCard
                key={lead.id}
                tone={isArchived ? "gray" : lead.status === "new" ? "blue" : "purple"}
                title={
                  <span className={cn("text-foreground", isArchived && "text-muted-foreground")}>
                    {lead.business_name}
                  </span>
                }
                subtitle={`${lead.niche ?? "—"} · ${lead.city ?? "—"}${lead.state ? `, ${lead.state}` : ""}`}
                chips={
                  <>
                    <Badge tone={stat.tone}>{stat.label}</Badge>
                    <Badge tone={sb.tone}>{sb.label}</Badge>
                    {lead.phone && <Chip>{lead.phone}</Chip>}
                    {lead.website_url && (
                      <Chip>
                        <a href={lead.website_url} target="_blank" rel="noreferrer" className="hover:text-foreground truncate max-w-[180px]">
                          {lead.website_url.replace(/^https?:\/\//, "").slice(0, 30)}
                        </a>
                      </Chip>
                    )}
                    <Chip>Added {fmtRelative(lead.created_at)}</Chip>
                  </>
                }
                actions={
                  isArchived ? null : (
                    <button
                      className="btn-ghost"
                      disabled={busyId === lead.id}
                      onClick={() => archive(lead)}
                    >
                      Archive
                    </button>
                  )
                }
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
