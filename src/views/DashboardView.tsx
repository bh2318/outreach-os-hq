import { useDashboardMetrics, useTabBadges } from "@/hooks/useMetrics";
import { useCallRequests, useMockRequests, useReplies } from "@/hooks/useData";
import { ScraperBar } from "@/components/ScraperBar";
import { SectionLabel } from "@/components/SectionLabel";
import { CallRequestCard } from "@/components/CallRequestCard";
import { MockRequestCard } from "@/components/MockRequestCard";
import { ReplyCard } from "@/components/ReplyCard";

function MetricCard({ label, value, delta }: { label: string; value: string; delta?: string }) {
  return (
    <div className="surface-card flex flex-col items-center text-center py-5">
      <div className="text-[24px] font-medium text-metric-value font-mono leading-none">{value}</div>
      <div className="label-uppercase mt-2 mb-0">{label}</div>
      {delta && <div className="text-[10px] text-status-green-text mt-1.5">{delta}</div>}
    </div>
  );
}

export function DashboardView() {
  const { data: m } = useDashboardMetrics();
  const { data: badges } = useTabBadges();
  const calls = useCallRequests();
  const mocks = useMockRequests();
  const replies = useReplies();

  const todayDelta = (m?.leadsToday ?? 0) - (m?.leadsYesterday ?? 0);

  // Build "needs your attention" — sort by tone priority red → amber → blue
  type Item = { tone: "red" | "amber" | "blue"; node: React.ReactNode; key: string };
  const items: Item[] = [];

  (calls.data ?? []).filter(r => !r.actioned).forEach(r =>
    items.push({ tone: "red", key: `call-${r.id}`, node: <CallRequestCard reply={r as any} /> })
  );
  (mocks.data ?? []).filter(m => m.status === "pending" || m.status === "ready").forEach(m =>
    items.push({ tone: m.status === "ready" ? "amber" : "amber", key: `mock-${m.id}`, node: <MockRequestCard mock={m} /> })
  );
  (replies.data ?? []).filter(r => !r.actioned && ["interested", "price_inquiry", "mock_request"].includes(r.intent ?? "")).forEach(r =>
    items.push({ tone: "blue", key: `reply-${r.id}`, node: <ReplyCard reply={r} /> })
  );

  const order = { red: 0, amber: 1, blue: 2 } as const;
  items.sort((a, b) => order[a.tone] - order[b.tone]);
  const top = items.slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-3">
        <MetricCard
          label="Leads today"
          value={String(m?.leadsToday ?? 0)}
          delta={todayDelta >= 0 ? `+${todayDelta} vs yesterday` : `${todayDelta} vs yesterday`}
        />
        <MetricCard label="Interested" value={String(m?.interested ?? 0)} delta={`${badges?.replies ?? 0} unactioned`} />
        <MetricCard label="Closed this week" value={String(m?.closedThisWeek ?? 0)} delta="+1 vs last week" />
        <MetricCard label="Revenue MTD" value={`$${((m?.revenueCents ?? 0) / 100).toLocaleString()}`} delta="+$0 vs last month" />
      </div>

      <ScraperBar />

      <div>
        <SectionLabel>Needs your attention</SectionLabel>
        {top.length === 0 ? (
          <div className="text-[12px] text-faint py-8 text-center">All caught up.</div>
        ) : (
          <div className="space-y-2">{top.map(i => <div key={i.key}>{i.node}</div>)}</div>
        )}
      </div>
    </div>
  );
}
