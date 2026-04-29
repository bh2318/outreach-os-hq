import { useDashboardMetrics } from "@/hooks/useMetrics";

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="text-[12px] font-medium text-metric-value font-mono">{value}</span>
    </div>
  );
}

export function TopBar() {
  const { data } = useDashboardMetrics();
  return (
    <div className="h-12 border-b border-border bg-background flex items-center px-4 gap-6 sticky top-0 z-30 overflow-x-auto whitespace-nowrap">
      <div className="flex items-center gap-2.5">
        <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <rect x="0.5" y="0.5" width="4.5" height="4.5" rx="1" fill="hsl(var(--primary-fill-text))" />
            <rect x="7" y="0.5" width="4.5" height="4.5" rx="1" fill="hsl(var(--primary-fill-text))" />
            <rect x="0.5" y="7" width="4.5" height="4.5" rx="1" fill="hsl(var(--primary-fill-text))" />
            <rect x="7" y="7" width="4.5" height="4.5" rx="1" fill="hsl(var(--primary-fill-text))" />
          </svg>
        </div>
        <span className="text-[14px] font-medium tracking-tight">Outreach OS</span>
      </div>

      <div className="flex items-center gap-2 ml-2">
        <span className="pulse-dot" />
        <span className="text-[11px] text-muted-foreground">System running</span>
      </div>

      <div className="ml-auto flex items-center gap-4 max-md:hidden">
        <StatItem label="Leads today" value={String(data?.leadsToday ?? 0)} />
        <span className="w-px h-4 bg-faint" />
        <StatItem label="Emails sent" value={String(data?.emailsSent ?? 0)} />
        <span className="w-px h-4 bg-faint" />
        <StatItem label="Reply rate" value={`${data?.replyRate ?? 0}%`} />
        <span className="w-px h-4 bg-faint" />
        <StatItem label="Revenue" value={`$${((data?.revenueCents ?? 0) / 100).toLocaleString()}`} />
      </div>
    </div>
  );
}
