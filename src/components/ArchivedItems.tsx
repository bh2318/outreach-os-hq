import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SectionLabel } from "@/components/SectionLabel";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { fmtRelative } from "@/lib/format";

type TabId = "leads" | "replies" | "followups" | "deals" | "mocks";

const TABS: { id: TabId; label: string }[] = [
  { id: "leads", label: "Leads" },
  { id: "replies", label: "Replies" },
  { id: "followups", label: "Follow-Ups" },
  { id: "deals", label: "Deals" },
  { id: "mocks", label: "Mocks" },
];

function useArchived(tab: TabId) {
  return useQuery({
    queryKey: ["archived", tab],
    queryFn: async () => {
      if (tab === "leads") {
        const { data, error } = await supabase
          .from("leads")
          .select("id,business_name,niche,city,state,phone,email,status,archived_at")
          .eq("archived", true)
          .order("archived_at", { ascending: false })
          .limit(500);
        if (error) throw error;
        return data ?? [];
      }
      if (tab === "replies") {
        const { data, error } = await supabase
          .from("replies")
          .select("id,subject,body,intent,from_email,received_at,archived_at,leads(business_name)")
          .eq("archived", true)
          .order("archived_at", { ascending: false })
          .limit(500);
        if (error) throw error;
        return data ?? [];
      }
      if (tab === "followups") {
        const { data, error } = await supabase
          .from("followup_queue")
          .select("id,business_name,sequence_number,due_date,draft_subject,archived_at")
          .eq("archived", true)
          .order("archived_at", { ascending: false })
          .limit(500);
        if (error) throw error;
        return data ?? [];
      }
      if (tab === "deals") {
        const { data, error } = await supabase
          .from("deals")
          .select("id,stage,estimated_value,paid_amount_cents,archived_at,leads(business_name)")
          .eq("archived", true)
          .order("archived_at", { ascending: false })
          .limit(500);
        if (error) throw error;
        return data ?? [];
      }
      const { data, error } = await supabase
        .from("mock_sites")
        .select("id,status,preview_url,requested_at,archived_at,leads(business_name)")
        .eq("archived", true)
        .order("archived_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function ArchivedItems() {
  const [tab, setTab] = useState<TabId>("leads");
  const { data, isLoading } = useArchived(tab);
  const qc = useQueryClient();

  async function restore(id: string) {
    const table =
      tab === "leads" ? "leads" :
      tab === "replies" ? "replies" :
      tab === "followups" ? "followup_queue" :
      tab === "deals" ? "deals" : "mock_sites";
    const patch: any = { archived: false, archived_at: null };
    if (tab === "leads") {
      // also clear reply.actioned was tied to archive? Not for leads.
    }
    if (tab === "replies") {
      patch.actioned = false;
    }
    const { error } = await (supabase.from(table) as any).update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Restored");
    qc.invalidateQueries();
  }

  const rows = useMemo(() => data ?? [], [data]);

  function renderRow(r: any) {
    const archivedAt = r.archived_at ? fmtRelative(r.archived_at) : "—";
    if (tab === "leads") {
      return (
        <div key={r.id} className="flex items-center gap-3 px-3 py-2 border-t border-border-faint">
          <div className="flex-1 min-w-0">
            <div className="text-[12px] font-medium text-foreground truncate">{r.business_name}</div>
            <div className="text-[10px] text-muted-foreground truncate">
              {[r.niche, r.city, r.state, r.email, r.phone].filter(Boolean).join(" · ") || "—"}
            </div>
          </div>
          <div className="text-[10px] text-muted-foreground w-28 text-right">Archived {archivedAt}</div>
          <button className="btn-ghost" onClick={() => restore(r.id)}>Restore</button>
        </div>
      );
    }
    if (tab === "replies") {
      return (
        <div key={r.id} className="flex items-center gap-3 px-3 py-2 border-t border-border-faint">
          <div className="flex-1 min-w-0">
            <div className="text-[12px] font-medium text-foreground truncate">
              {r.leads?.business_name ?? r.from_email ?? "Reply"}
            </div>
            <div className="text-[10px] text-muted-foreground truncate">
              {(r.subject ?? "").slice(0, 80)} {r.intent ? `· ${r.intent}` : ""}
            </div>
          </div>
          <div className="text-[10px] text-muted-foreground w-28 text-right">Archived {archivedAt}</div>
          <button className="btn-ghost" onClick={() => restore(r.id)}>Restore</button>
        </div>
      );
    }
    if (tab === "followups") {
      return (
        <div key={r.id} className="flex items-center gap-3 px-3 py-2 border-t border-border-faint">
          <div className="flex-1 min-w-0">
            <div className="text-[12px] font-medium text-foreground truncate">{r.business_name}</div>
            <div className="text-[10px] text-muted-foreground truncate">
              Sequence #{r.sequence_number} · Due {r.due_date}
              {r.draft_subject ? ` · ${r.draft_subject}` : ""}
            </div>
          </div>
          <div className="text-[10px] text-muted-foreground w-28 text-right">Archived {archivedAt}</div>
          <button className="btn-ghost" onClick={() => restore(r.id)}>Restore</button>
        </div>
      );
    }
    if (tab === "deals") {
      return (
        <div key={r.id} className="flex items-center gap-3 px-3 py-2 border-t border-border-faint">
          <div className="flex-1 min-w-0">
            <div className="text-[12px] font-medium text-foreground truncate">{r.leads?.business_name ?? "—"}</div>
            <div className="text-[10px] text-muted-foreground truncate">
              {r.stage} {r.estimated_value ? `· est $${r.estimated_value}` : ""}
            </div>
          </div>
          <div className="text-[10px] text-muted-foreground w-28 text-right">Archived {archivedAt}</div>
          <button className="btn-ghost" onClick={() => restore(r.id)}>Restore</button>
        </div>
      );
    }
    return (
      <div key={r.id} className="flex items-center gap-3 px-3 py-2 border-t border-border-faint">
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-medium text-foreground truncate">{r.leads?.business_name ?? "Mock"}</div>
          <div className="text-[10px] text-muted-foreground truncate">
            {r.status} {r.preview_url ? `· ${r.preview_url}` : ""}
          </div>
        </div>
        <div className="text-[10px] text-muted-foreground w-28 text-right">Archived {archivedAt}</div>
        <button className="btn-ghost" onClick={() => restore(r.id)}>Restore</button>
      </div>
    );
  }

  return (
    <div className="surface-card">
      <SectionLabel>Archived items</SectionLabel>
      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded-full px-3 py-1 text-[11px] border transition-colors",
              tab === t.id
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-transparent text-muted-foreground border-border hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="rounded-md border border-border-faint overflow-hidden">
        {isLoading ? (
          <div className="px-3 py-6 text-[11px] text-muted-foreground">Loading…</div>
        ) : !rows.length ? (
          <div className="px-3 py-6 text-[11px] text-muted-foreground">
            No archived {TABS.find((t) => t.id === tab)?.label.toLowerCase()} yet.
          </div>
        ) : (
          rows.map(renderRow)
        )}
      </div>
    </div>
  );
}
