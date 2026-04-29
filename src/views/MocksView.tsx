import { useMockRequests } from "@/hooks/useData";
import { SectionLabel } from "@/components/SectionLabel";
import { MockRequestCard } from "@/components/MockRequestCard";
import { EmptyState } from "@/components/EmptyState";

export function MocksView() {
  const { data, isLoading } = useMockRequests();
  const count = data?.length ?? 0;
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <SectionLabel>Mock site requests</SectionLabel>
        {count > 0 && (
          <span className="text-[10px] text-status-blue-text">
            {count} to build
          </span>
        )}
      </div>
      {isLoading ? null : !data?.length ? (
        <EmptyState>No mock requests pending.</EmptyState>
      ) : (
        <div className="space-y-2">{data.map(m => <MockRequestCard key={m.id} mock={m} />)}</div>
      )}
    </div>
  );
}
