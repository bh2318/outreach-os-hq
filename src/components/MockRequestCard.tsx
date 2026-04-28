import { Badge } from "./Badge";
import { Chip } from "./Chip";
import { PriorityCard } from "./PriorityCard";
import { useRecordAction } from "@/hooks/useData";
import { fmtRelative } from "@/lib/format";
import { Loader2 } from "lucide-react";

export function MockRequestCard({ mock }: { mock: any }) {
  const action = useRecordAction();
  const lead = mock.leads;
  const status = mock.status as string;

  const toneMap: any = { pending: "amber", generating: "blue", ready: "green", sent: "gray", expired: "gray" };
  const badgeMap: any = {
    pending: <Badge tone="amber">Pending build</Badge>,
    generating: <Badge tone="blue">Generating…</Badge>,
    ready: <Badge tone="green">Ready to send</Badge>,
    sent: <Badge tone="gray">Sent</Badge>,
    expired: <Badge tone="gray">Expired</Badge>,
  };

  const generate = () => {
    action.mutate({
      table: "mock_sites", id: mock.id, patch: { status: "generating" },
      log: { action_type: "mock_generated", business_name: lead?.business_name, detail: "Mock generation started", lead_id: mock.lead_id },
      toast: "Mock generation queued",
    });
  };

  const send = () => {
    action.mutate({
      table: "mock_sites", id: mock.id, patch: { status: "sent", sent_at: new Date().toISOString() },
      log: { action_type: "mock_sent", business_name: lead?.business_name, detail: "Mock site sent to client", lead_id: mock.lead_id },
      toast: "Mock sent",
    });
  };

  return (
    <PriorityCard
      tone={toneMap[status] ?? "gray"}
      title={lead?.business_name ?? "Unknown"}
      subtitle={`${lead?.owner_name ?? "—"} · ${lead?.city ?? ""} · ${lead?.niche ?? ""}`}
      chips={
        <>
          <Chip>Requested {fmtRelative(mock.requested_at)}</Chip>
          <Chip>{lead?.site_score != null ? `Site score ${lead.site_score}` : "No existing site"}</Chip>
        </>
      }
      badge={badgeMap[status]}
      actions={
        <>
          {status === "pending" && (
            <button className="btn-primary" onClick={generate}>Generate mock</button>
          )}
          {status === "generating" && (
            <button className="btn-primary" disabled><Loader2 className="w-3 h-3 animate-spin" /> Generating…</button>
          )}
          {status === "ready" && (
            <>
              <button className="btn-ghost">Preview mock</button>
              <button className="btn-primary" onClick={send}>Send to client</button>
            </>
          )}
          {status === "sent" && <button className="btn-ghost">Preview mock</button>}
          <button className="btn-ghost">View lead</button>
        </>
      }
    />
  );
}
