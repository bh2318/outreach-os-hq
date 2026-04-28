import { Badge } from "./Badge";
import { Chip } from "./Chip";
import { PriorityCard } from "./PriorityCard";
import { useRecordAction } from "@/hooks/useData";
import { fmtRelative, truncate } from "@/lib/format";

const intentMeta: Record<string, { tone: any; label: string; hot?: boolean }> = {
  call_request: { tone: "blue", label: "Hot lead", hot: true },
  interested: { tone: "blue", label: "Interested", hot: true },
  price_inquiry: { tone: "blue", label: "Price inquiry", hot: true },
  mock_request: { tone: "blue", label: "Mock requested", hot: true },
  not_interested: { tone: "gray", label: "Not interested" },
  unsubscribe: { tone: "gray", label: "Unsubscribed" },
  angry: { tone: "red", label: "Flagged" },
  unknown: { tone: "amber", label: "Needs review" },
};

export function ReplyCard({ reply }: { reply: any }) {
  const action = useRecordAction();
  const lead = reply.leads;
  const meta = intentMeta[reply.intent] ?? intentMeta.unknown;
  const isNotInterested = reply.intent === "not_interested" || reply.intent === "unsubscribe";
  const isFlagged = reply.intent === "angry";
  const needsReview = reply.intent === "unknown";

  const tone = isFlagged ? "red" : isNotInterested ? "gray" : meta.tone;

  const archive = () => action.mutate({
    table: "replies", id: reply.id, patch: { actioned: true },
    log: { action_type: "replied", business_name: lead?.business_name, detail: "Reply archived", outcome: "warning", lead_id: reply.lead_id },
    toast: "Reply archived",
  });

  const moveToPipeline = () => action.mutate({
    table: "replies", id: reply.id, patch: { actioned: true },
    log: { action_type: "deal_updated", business_name: lead?.business_name, detail: "Moved to pipeline", lead_id: reply.lead_id },
    toast: "Moved to pipeline",
  });

  return (
    <PriorityCard
      tone={tone}
      accentLeft={meta.hot}
      title={
        <span>
          <span className="text-foreground">{lead?.business_name}</span>
          <span className="text-muted-foreground font-normal"> — {truncate(reply.body, 80)}</span>
        </span>
      }
      subtitle={`${reply.from_email} · ${fmtRelative(reply.received_at)}`}
      chips={<><Chip>{lead?.niche} · {lead?.city}</Chip></>}
      badge={<Badge tone={tone}>{meta.label}</Badge>}
      actions={
        <>
          {meta.hot && (
            <>
              <button className="btn-primary">Reply</button>
              <button className="btn-ghost">View thread</button>
              <button className="btn-ghost" onClick={moveToPipeline}>Move to pipeline</button>
            </>
          )}
          {isNotInterested && <button className="btn-ghost" onClick={archive}>Archive</button>}
          {needsReview && (
            <>
              <button className="btn-primary">Classify</button>
              <button className="btn-ghost">View thread</button>
            </>
          )}
          {isFlagged && <button className="btn-ghost" onClick={archive}>Archive</button>}
        </>
      }
    />
  );
}
