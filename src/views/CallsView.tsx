import { useCallRequests } from "@/hooks/useData";
import { SectionLabel } from "@/components/SectionLabel";
import { CallRequestCard } from "@/components/CallRequestCard";
import { EmptyState } from "@/components/EmptyState";

export function CallsView() {
  const { data, isLoading } = useCallRequests();
  const count = data?.length ?? 0;
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <SectionLabel>Call requests — schedule these</SectionLabel>
        {count > 0 && (
          <span className="text-[10px] text-status-amber-text">
            {count} pending
          </span>
        )}
      </div>
      {isLoading ? null : !data?.length ? (
        <EmptyState>No call requests right now — the system is working on it.</EmptyState>
      ) : (
        <div className="space-y-2">{data.map(r => <CallRequestCard key={r.id} reply={r as any} />)}</div>
      )}
    </div>
  );
}
