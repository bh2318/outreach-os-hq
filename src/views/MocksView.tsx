import { useMockRequests } from "@/hooks/useData";
import { SectionLabel } from "@/components/SectionLabel";
import { MockRequestCard } from "@/components/MockRequestCard";
import { EmptyState } from "@/components/EmptyState";

export function MocksView() {
  const { data, isLoading } = useMockRequests();
  return (
    <div>
      <SectionLabel>Mock site requests</SectionLabel>
      {isLoading ? null : !data?.length ? (
        <EmptyState>No mock requests pending.</EmptyState>
      ) : (
        <div className="space-y-2">{data.map(m => <MockRequestCard key={m.id} mock={m} />)}</div>
      )}
    </div>
  );
}
