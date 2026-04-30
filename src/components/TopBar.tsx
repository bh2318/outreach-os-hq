import { useEffect, useState } from "react";
import { useDashboardMetrics } from "@/hooks/useMetrics";
import { NotificationBell } from "./NotificationBell";

const CYCLE_SECONDS = 5 * 60;
const CYCLE_KEY = "outreach_os_cycle_anchor";

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="text-[12px] font-medium text-metric-value font-mono">{value}</span>
    </div>
  );
}

function useCycleCountdown(active: boolean) {
  const [secondsLeft, setSecondsLeft] = useState(CYCLE_SECONDS);
  useEffect(() => {
    if (!active) {
      setSecondsLeft(CYCLE_SECONDS);
      return;
    }
    const stored = Number(localStorage.getItem(CYCLE_KEY) ?? 0);
    let anchor = stored && !Number.isNaN(stored) ? stored : 0;
    const now = Date.now();
    if (!anchor || now - anchor > CYCLE_SECONDS * 1000) {
      anchor = now;
      localStorage.setItem(CYCLE_KEY, String(anchor));
    }
    const tick = () => {
      const elapsed = Math.floor((Date.now() - anchor) / 1000);
      let remaining = CYCLE_SECONDS - elapsed;
      if (remaining <= 0) {
        anchor = Date.now();
        localStorage.setItem(CYCLE_KEY, String(anchor));
        remaining = CYCLE_SECONDS;
      }
      setSecondsLeft(remaining);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [active]);
  return secondsLeft;
}

function formatCountdown(s: number): string {
  if (s >= 60) {
    const m = Math.ceil(s / 60);
    return `Next cycle in ${m} min`;
  }
  return `Next cycle in ${s}s`;
}

export function TopBar() {
  const { data } = useDashboardMetrics();
  const replyRate = data?.replyRatePct ?? 0;
  const active = !!data?.outreachActive;
  const cycleLeft = useCycleCountdown(active);
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
        <span className={active ? "pulse-dot" : "w-1.5 h-1.5 rounded-full bg-subtle"} />
        <span className="text-[11px] text-muted-foreground">
          {active ? "System running" : "System paused"}
        </span>
        {active && (
          <>
            <span className="w-px h-3 bg-faint" />
            <span className="text-[11px] text-status-green-text font-mono">
              {formatCountdown(cycleLeft)}
            </span>
          </>
        )}
      </div>

      <div className="ml-auto flex items-center gap-4 max-md:hidden">
        <StatItem label="Leads in queue" value={String(data?.leadsInQueue ?? 0)} />
        <span className="w-px h-4 bg-faint" />
        <StatItem label="Emails today" value={String(data?.emailsSentToday ?? 0)} />
        <span className="w-px h-4 bg-faint" />
        <StatItem label="Reply rate" value={`${replyRate.toFixed(1)}%`} />
        <span className="w-px h-4 bg-faint" />
        <StatItem label="Revenue MTD" value={`$${((data?.revenueMtdCents ?? 0) / 100).toLocaleString()}`} />
      </div>

      <div className="ml-3 flex items-center gap-1">
        <NotificationBell />
      </div>
    </div>
  );
}
