import { useMemo, useState } from "react";
import { useActivityLog } from "@/hooks/useData";
import { SectionLabel } from "@/components/SectionLabel";
import { EmptyState } from "@/components/EmptyState";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function eventColor(action: string, outcome: string) {
  if (outcome === "warning" || outcome === "failed" || outcome === "flagged") return "text-status-amber-text";
  if (["replied", "mock_sent", "invoice_paid", "deal_updated"].includes(action)) return "text-status-green-text";
  if (["scraped", "system"].includes(action)) return "text-status-blue-text";
  return "text-muted-foreground";
}

function fmtTimestamp(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-US", { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

export function ActivityView() {
  const { data, isLoading } = useActivityLog();
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return data ?? [];
    return (data ?? []).filter(r =>
      (r.business_name?.toLowerCase().includes(term)) ||
      (r.detail?.toLowerCase().includes(term)) ||
      (r.action_type?.toLowerCase().includes(term))
    );
  }, [data, q]);

  const exportCsv = () => {
    const rows = [["timestamp", "action_type", "business_name", "outcome", "detail"]];
    (filtered ?? []).forEach(r => rows.push([r.created_at, r.action_type, r.business_name ?? "", r.outcome, r.detail ?? ""]));
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `activity-log-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success("Activity log exported");
  };

  return (
    <div>
      <SectionLabel>Activity log — every automated action</SectionLabel>

      <div className="flex items-center gap-2 mb-4">
        <input
          className="input-base flex-1"
          placeholder="Filter by name, action type…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button className="btn-ghost" onClick={exportCsv}>Export CSV</button>
      </div>

      {isLoading ? null : !filtered.length ? (
        <EmptyState>No activity yet.</EmptyState>
      ) : (
        <div className="surface-card p-0">
          {filtered.map((r, i) => (
            <div
              key={r.id}
              className={cn("flex items-start gap-4 px-4 py-2.5", i > 0 && "border-t border-border-faint")}
            >
              <div className="text-[11px] text-muted-foreground font-mono tabular-nums w-36 shrink-0">{fmtTimestamp(r.created_at)}</div>
              <div className={cn("text-[12px] flex-1", eventColor(r.action_type, r.outcome))}>
                {r.business_name && <span className="text-foreground font-medium">{r.business_name} · </span>}
                {r.detail}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
