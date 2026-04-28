import { Badge } from "./Badge";
import { Chip } from "./Chip";
import { PriorityCard } from "./PriorityCard";
import { useRecordAction } from "@/hooks/useData";
import { fmtRelative } from "@/lib/format";

interface Reply {
  id: string;
  body: string;
  from_email: string;
  received_at: string;
  intent: string;
  actioned: boolean;
  lead_id: string;
  leads: any;
}

export function CallRequestCard({ reply }: { reply: Reply }) {
  const action = useRecordAction();
  const lead = reply.leads;
  const scheduled = reply.actioned;
  const tone = scheduled ? "green" : "red";

  return (
    <PriorityCard
      tone={tone}
      title={lead?.business_name ?? "Unknown business"}
      subtitle={`${lead?.owner_name ?? "—"} · ${reply.from_email} · ${lead?.phone ?? "no phone"}`}
      chips={
        <>
          <Chip>{lead?.niche} · {lead?.city}</Chip>
          <Chip>Replied {fmtRelative(reply.received_at)}</Chip>
          <Chip>{lead?.site_score != null ? `Site score ${lead.site_score}` : "No existing site"}</Chip>
        </>
      }
      badge={scheduled ? <Badge tone="green">Scheduled</Badge> : <Badge tone="red">Unscheduled</Badge>}
      actions={
        <>
          <button
            className="btn-primary"
            onClick={() =>
              action.mutate({
                table: "replies", id: reply.id, patch: { actioned: true },
                log: { action_type: "deal_updated", business_name: lead?.business_name, detail: "Call scheduled", lead_id: reply.lead_id },
                toast: "Call scheduled",
              })
            }
          >
            Schedule call
          </button>
          <button className="btn-ghost">View lead</button>
          <button
            className="btn-ghost"
            onClick={() =>
              action.mutate({
                table: "replies", id: reply.id, patch: { actioned: true },
                log: { action_type: "deal_updated", business_name: lead?.business_name, detail: "Call marked complete", lead_id: reply.lead_id },
                toast: "Marked complete",
              })
            }
          >
            Mark complete
          </button>
        </>
      }
    />
  );
}
