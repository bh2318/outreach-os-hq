import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useDashboardMetrics } from "@/hooks/useMetrics";
import { supabase } from "@/integrations/supabase/client";
import { NotificationBell } from "./NotificationBell";

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="text-[12px] font-medium text-metric-value font-mono">{value}</span>
    </div>
  );
}

function useCycleSettings() {
  return useQuery({
    queryKey: ["topbar-cycle-settings"],
    queryFn: async () => {
      const { data } = await supabase
        .from("settings")
        .select("minutes_between_cycles, last_cycle_at")
        .eq("id", 1)
        .maybeSingle();
      return {
        minutes: Math.max(1, Math.min(60, Number((data as any)?.minutes_between_cycles ?? 5))),
        lastCycleAt: (data as any)?.last_cycle_at as string | null,
      };
    },
    refetchInterval: 15000,
  });
}

function formatCountdown(s: number): string {
  if (s <= 0) return "Next cycle imminent";
  if (s >= 60) {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `Next cycle in ${m}m ${r.toString().padStart(2, "0")}s`;
  }
  return `Next cycle in ${s}s`;
}

export function TopBar() {
  const { data } = useDashboardMetrics();
  const { data: cycle } = useCycleSettings();
  const replyRate = data?.replyRatePct ?? 0;
  const active = !!data?.outreachActive;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  let secondsLeft = 0;
  if (cycle) {
    const intervalMs = cycle.minutes * 60 * 1000;
    const anchor = cycle.lastCycleAt ? new Date(cycle.lastCycleAt).getTime() : now - intervalMs;
    const elapsed = now - anchor;
    secondsLeft = Math.max(0, Math.ceil((intervalMs - elapsed) / 1000));
  }

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
              {formatCountdown(secondsLeft)}
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
