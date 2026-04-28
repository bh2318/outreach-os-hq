import { useReplies } from "@/hooks/useData";
import { SectionLabel } from "@/components/SectionLabel";
import { ReplyCard } from "@/components/ReplyCard";
import { EmptyState } from "@/components/EmptyState";

const HOT = new Set(["call_request", "mock_request", "interested", "price_inquiry"]);
const COLD = new Set(["not_interested", "unsubscribe"]);

export function RepliesView() {
  const { data, isLoading } = useReplies();
  const sorted = [...(data ?? [])].sort((a, b) => {
    const score = (r: any) => HOT.has(r.intent) ? 0 : COLD.has(r.intent) ? 2 : 1;
    return score(a) - score(b);
  });

  return (
    <div>
      <SectionLabel>Inbound replies</SectionLabel>
      {isLoading ? null : !sorted.length ? (
        <EmptyState>No replies yet.</EmptyState>
      ) : (
        <div className="space-y-2">{sorted.map(r => <ReplyCard key={r.id} reply={r} />)}</div>
      )}
    </div>
  );
}
