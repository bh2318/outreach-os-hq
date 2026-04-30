import { useState } from "react";
import { useDeals, useRecordAction } from "@/hooks/useData";
import { SectionLabel } from "@/components/SectionLabel";
import { EmptyState } from "@/components/EmptyState";
import { Badge } from "@/components/Badge";
import { fmtMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

const STAGES = ["all", "contacted", "replied", "mock_sent", "proposal_sent", "agreement_received", "building", "delivered", "paid"];

const STAGE_TONE: Record<string, any> = {
  contacted: "gray", replied: "gray",
  mock_sent: "amber", proposal_sent: "amber",
  agreement_received: "blue", building: "blue",
  delivered: "green", paid: "green",
};

const STAGE_LABEL: Record<string, string> = {
  contacted: "Contacted", replied: "Replied",
  mock_sent: "Mock Sent", proposal_sent: "Proposal Sent",
  agreement_received: "Agreement Received",
  building: "Building", delivered: "Delivered", paid: "Paid",
};

function daysSince(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

export function PipelineView() {
  const { data, isLoading } = useDeals();
  const action = useRecordAction();
  const [filter, setFilter] = useState<string>("all");

  const deals = (data ?? []).filter(d => filter === "all" || d.stage === filter);

  const advance = (deal: any, nextStage: string, msg: string, toastMsg: string) => {
    action.mutate({
      table: "deals", id: deal.id,
      patch: { stage: nextStage, stage_entered_at: new Date().toISOString() },
      log: { action_type: "deal_updated", business_name: deal.leads?.business_name, detail: msg, lead_id: deal.lead_id },
      toast: toastMsg,
    });
  };

  return (
    <div>
      <SectionLabel>Active pipeline</SectionLabel>

      <div className="flex items-center gap-1.5 mb-4 flex-wrap">
        {STAGES.map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={cn(
              "text-[10px] px-2.5 py-1 rounded-full border transition-colors",
              filter === s
                ? "bg-primary-fill border-primary-fill-border text-primary-fill-text"
                : "border-border text-muted-foreground hover:bg-border"
            )}
          >
            {s === "all" ? "All" : STAGE_LABEL[s] ?? s}
          </button>
        ))}
      </div>

      {isLoading ? null : !deals.length ? (
        <EmptyState>No deals in this stage.</EmptyState>
      ) : (
        <div className="surface-card p-0 overflow-hidden">
          {deals.map((d, i) => (
            <div key={d.id} className={cn("flex items-center gap-4 px-4 py-3", i > 0 && "border-t border-border-faint")}>
              <div className="flex-[2] text-[12px] font-medium text-foreground truncate">{d.leads?.business_name ?? "—"}</div>
              <div className="flex-1"><Badge tone={STAGE_TONE[d.stage] ?? "gray"}>{STAGE_LABEL[d.stage] ?? d.stage}</Badge></div>
              <div className="w-24 text-[11px] text-muted-foreground font-mono">{fmtMoney(d.estimated_value)}</div>
              <div className="w-24 text-[11px] text-muted-foreground">{daysSince(d.stage_entered_at)}d in stage</div>
              <div className="w-32 text-right">
                {d.stage === "building" && <button className="btn-primary" onClick={() => advance(d, "delivered", "Site review complete → delivered", "Marked delivered")}>Review site</button>}
                {d.stage === "agreement_received" && <button className="btn-green" onClick={() => advance(d, "building", "Build started", "Build started")}>Start build</button>}
                {d.stage === "mock_sent" && <button className="btn-ghost" onClick={() => advance(d, "proposal_sent", "Follow-up sent", "Follow-up logged")}>Follow up</button>}
                {d.stage === "delivered" && <button className="btn-green" onClick={() => advance(d, "paid", "Marked paid", "Marked paid")}>Mark paid</button>}
                {(d.stage === "contacted" || d.stage === "replied" || d.stage === "proposal_sent" || d.stage === "paid") && (
                  <button className="btn-ghost">View lead</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
