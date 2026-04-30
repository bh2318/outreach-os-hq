import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SectionLabel } from "@/components/SectionLabel";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { fmtRelative } from "@/lib/format";

type TabId = "leads" | "replies" | "followups" | "deals" | "mocks";

const TABS: { id: TabId; label: string; table: string }[] = [
  { id: "leads", label: "Leads", table: "leads" },
  { id: "replies", label: "Replies", table: "replies" },
  { id: "followups", label: "Follow-Ups", table: "followup_queue" },
  { id: "deals", label: "Deals", table: "deals" },
  { id: "mocks", label: "Mocks", table: "mock_sites" },
];

function tableFor(tab: TabId): string {
  return TABS.find((t) => t.id === tab)!.table;
}

function useArchived(tab: TabId, enabled: boolean) {
  return useQuery({
    queryKey: ["archived", tab],
    enabled,
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
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<TabId>("leads");
  const { data, isLoading } = useArchived(tab, open);
  const qc = useQueryClient();

  async function restore(id: string) {
    const table = tableFor(tab);
    const patch: any = { archived: false, archived_at: null };
    if (tab === "replies") patch.actioned = false;
    const { error } = await (supabase.from(table) as any).update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Restored");
    qc.invalidateQueries();
  }

  async function deleteOne(id: string) {
    const ok = window.confirm("This cannot be undone — permanently delete this item?");
    if (!ok) return;
    const table = tableFor(tab);
    const { error } = await (supabase.from(table) as any).delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Permanently deleted");
    qc.invalidateQueries({ queryKey: ["archived", tab] });
  }

  async function deleteAll() {
    const label = TABS.find((t) => t.id === tab)?.label.toLowerCase();
    const ok = window.confirm(`This cannot be undone — permanently delete ALL archived ${label}?`);
    if (!ok) return;
    const table = tableFor(tab);
    const { error } = await (supabase.from(table) as any).delete().eq("archived", true);
    if (error) return toast.error(error.message);
    toast.success(`Deleted all archived ${label}`);
    qc.invalidateQueries({ queryKey: ["archived", tab] });
  }

  const rows = useMemo(() => data ?? [], [data]);

  function renderRow(r: any) {
    const archivedAt = r.archived_at ? fmtRelative(r.archived_at) : "—";
    let title = "";
    let detail = "";
    if (tab === "leads") {
      title = r.business_name;
      detail = [r.niche, r.city, r.state, r.email, r.phone].filter(Boolean).join(" · ") || "—";
    } else if (tab === "replies") {
      title = r.leads?.business_name ?? r.from_email ?? "Reply";
      detail = `${(r.subject ?? "").slice(0, 80)}${r.intent ? ` · ${r.intent}` : ""}`;
    } else if (tab === "followups") {
      title = r.business_name;
      detail = `Sequence #${r.sequence_number} · Due ${r.due_date}${r.draft_subject ? ` · ${r.draft_subject}` : ""}`;
    } else if (tab === "deals") {
      title = r.leads?.business_name ?? "—";
      detail = `${r.stage}${r.estimated_value ? ` · est $${r.estimated_value}` : ""}`;
    } else {
      title = r.leads?.business_name ?? "Mock";
      detail = `${r.status}${r.preview_url ? ` · ${r.preview_url}` : ""}`;
    }
    return (
      <div key={r.id} className="flex items-center gap-3 px-3 py-2 border-t border-border-faint">
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-medium text-foreground truncate">{title}</div>
          <div className="text-[10px] text-muted-foreground truncate">{detail}</div>
        </div>
        <div className="text-[10px] text-muted-foreground w-28 text-right">Archived {archivedAt}</div>
        <button className="btn-ghost" onClick={() => restore(r.id)}>Restore</button>
        <button className="btn-ghost text-status-red-text hover:text-status-red-text" onClick={() => deleteOne(r.id)}>Delete Permanently</button>
      </div>
    );
  }

  return (
    <div className="surface-card">
      <div className="flex items-center justify-between">
        <SectionLabel>Archived items</SectionLabel>
        <button
          className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setOpen(!open)}
        >
          {open ? "Hide" : "Show"} Archived Items
        </button>
      </div>
      {open && (
        <>
          <div className="flex flex-wrap items-center gap-1.5 mb-3 mt-2">
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
            <button
              className="ml-auto text-[11px] text-status-red-text hover:underline disabled:opacity-50"
              disabled={!rows.length}
              onClick={deleteAll}
            >
              Delete All
            </button>
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
        </>
      )}
    </div>
  );
}
