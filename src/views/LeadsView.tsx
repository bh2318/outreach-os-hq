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
import { Plus, X, Loader2 } from "lucide-react";

const COMMON_CATEGORIES = [
  "Roofing",
  "Plumbing",
  "Electrician",
  "HVAC",
  "Landscaping",
  "Cleaning",
  "Auto repair",
  "Restaurant",
  "Cafe",
  "Salon / Barber",
  "Dental",
  "Medical / Wellness",
  "Legal",
  "Accounting / Financial",
  "Real estate",
  "Photography",
  "Fitness / Gym",
  "Pet services",
  "Contractor / Construction",
  "Retail",
  "Other",
];

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

function statusRank(l: Lead): number {
  if (l.archived || l.status === "archived") return 3;
  if (l.status === "new" && (l.site_score === null || !l.website_url || l.site_score >= 100)) return 0;
  if (l.status === "new") return 1;
  return 2; // contacted and other
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
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data ?? [])
      .filter((l) => {
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
        // Within new (rank 1): higher site_score first
        if (ra === 1) return (b.site_score ?? 0) - (a.site_score ?? 0);
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [data, search]);

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

  const queueCount = (data ?? []).filter((l) => !l.archived && l.status === "new").length;
  const [addOpen, setAddOpen] = useState(false);

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <SectionLabel>All leads</SectionLabel>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-muted-foreground font-mono">{queueCount} in queue</span>
          <button
            onClick={() => setAddOpen(true)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium",
              "bg-primary text-primary-foreground hover:bg-primary-hover"
            )}
          >
            <Plus className="w-3.5 h-3.5" /> Add Lead
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input
          className="input-base ml-auto"
          style={{ minWidth: 240 }}
          placeholder="Search business name, city, or niche…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? null : !filtered.length ? (
        <EmptyState>No leads in the database yet.</EmptyState>
      ) : (
        <div className="space-y-2">
          {filtered.map((lead) => {
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
