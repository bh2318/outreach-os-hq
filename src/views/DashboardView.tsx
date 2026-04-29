import { useDashboardMetrics } from "@/hooks/useMetrics";
import { useCallRequests, useMockRequests, useReplies } from "@/hooks/useData";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ScraperBar } from "@/components/ScraperBar";
import { SectionLabel } from "@/components/SectionLabel";
import { PriorityCard } from "@/components/PriorityCard";
import { Badge } from "@/components/Badge";
import { Chip } from "@/components/Chip";
import { fmtRelative, truncate, type StatusTone } from "@/lib/format";
import { navigateTab } from "@/lib/nav";
import { cn } from "@/lib/utils";

function MetricCard({
  label,
  value,
  context,
  tone,
}: {
  label: string;
  value: string;
  context?: string;
  tone?: StatusTone;
}) {
  const accent: Record<StatusTone, string> = {
    red: "text-status-red-text",
    amber: "text-status-amber-text",
    blue: "text-status-blue-text",
    green: "text-status-green-text",
    gray: "text-muted-foreground",
    purple: "text-primary-fill-text",
  };
  const barBg: Record<StatusTone, string> = {
    red: "bg-status-red-text",
    amber: "bg-status-amber-text",
    blue: "bg-status-blue-text",
    green: "bg-status-green-text",
    gray: "bg-subtle",
    purple: "bg-primary-hover",
  };
  return (
    <div className="surface-card relative flex flex-col items-center text-center py-5">
      {tone && <div className={cn("priority-bar", barBg[tone])} />}
      <div className={cn("text-[24px] font-medium font-mono leading-none", tone ? accent[tone] : "text-metric-value")}>
        {value}
      </div>
      <div className="label-uppercase mt-2 mb-0">{label}</div>
      {context && <div className="text-[10px] text-faint mt-1.5">{context}</div>}
    </div>
  );
}

function useFollowupsDue() {
  return useQuery({
    queryKey: ["followups-due-today"],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await supabase
        .from("followup_queue")
        .select("*")
        .eq("sent", false)
        .lte("due_date", today)
        .order("due_date", { ascending: true })
        .limit(20);
      return data ?? [];
    },
    refetchInterval: 30000,
  });
}

export function DashboardView() {
  const { data: m } = useDashboardMetrics();
  const calls = useCallRequests();
  const mocks = useMockRequests();
  const replies = useReplies();
  const followups = useFollowupsDue();

  // Attention feed: priority order — calls (red) → YES replies (green) →
  // mock requests (amber) → follow-ups due (amber) → MAYBE replies (blue)
  type AttItem = {
    key: string;
    tone: StatusTone;
    title: React.ReactNode;
    subtitle: React.ReactNode;
    chips?: React.ReactNode;
    badge: React.ReactNode;
    actionLabel: string;
    onAction: () => void;
    sortKey: number;
  };
  const items: AttItem[] = [];

  (calls.data ?? []).filter((r: any) => !r.actioned).forEach((r: any) => {
    items.push({
      key: `call-${r.id}`,
      tone: "red",
      title: r.leads?.business_name ?? "Unknown",
      subtitle: `Call requested · ${fmtRelative(r.received_at)}`,
      chips: <Chip>{r.leads?.niche} · {r.leads?.city}</Chip>,
      badge: <Badge tone="red">Call requested</Badge>,
      actionLabel: "Open in Calls",
      onAction: () => navigateTab("calls"),
      sortKey: 0,
    });
  });

  (replies.data ?? [])
    .filter((r: any) => !r.actioned && ["interested", "price_inquiry", "mock_request"].includes(r.intent))
    .forEach((r: any) => {
      items.push({
        key: `yes-${r.id}`,
        tone: "green",
        title: r.leads?.business_name ?? "Unknown",
        subtitle: truncate(r.body ?? "", 90),
        chips: <Chip>{r.leads?.niche} · {r.leads?.city}</Chip>,
        badge: <Badge tone="green">YES — interested</Badge>,
        actionLabel: "Open in Replies",
        onAction: () => navigateTab("replies"),
        sortKey: 1,
      });
    });

  (mocks.data ?? [])
    .filter((mk: any) => mk.status === "pending" || mk.status === "ready")
    .forEach((mk: any) => {
      items.push({
        key: `mock-${mk.id}`,
        tone: mk.status === "ready" ? "blue" : "amber",
        title: mk.leads?.business_name ?? "Unknown",
        subtitle: `Mock ${mk.status} · requested ${fmtRelative(mk.requested_at)}`,
        chips: <Chip>{mk.leads?.niche} · {mk.leads?.city}</Chip>,
        badge: <Badge tone={mk.status === "ready" ? "blue" : "amber"}>{mk.status === "ready" ? "Mock ready" : "Mock pending"}</Badge>,
        actionLabel: "Open in Mock Requests",
        onAction: () => navigateTab("mocks"),
        sortKey: 2,
      });
    });

  (followups.data ?? []).forEach((f: any) => {
    items.push({
      key: `fu-${f.id}`,
      tone: "amber",
      title: f.business_name,
      subtitle: `Follow-up #${f.sequence_number - 1} due ${f.due_date}`,
      badge: <Badge tone="amber">Follow-up due</Badge>,
      actionLabel: "Open in Follow-Ups",
      onAction: () => navigateTab("followups"),
      sortKey: 3,
    });
  });

  (replies.data ?? [])
    .filter((r: any) => !r.actioned && r.intent === "needs_response")
    .forEach((r: any) => {
      items.push({
        key: `maybe-${r.id}`,
        tone: "blue",
        title: r.leads?.business_name ?? "Unknown",
        subtitle: truncate(r.body ?? "", 90),
        chips: <Chip>{r.leads?.niche} · {r.leads?.city}</Chip>,
        badge: <Badge tone="blue">MAYBE — needs reply</Badge>,
        actionLabel: "Open in Replies",
        onAction: () => navigateTab("replies"),
        sortKey: 4,
      });
    });

  items.sort((a, b) => a.sortKey - b.sortKey);
  const top = items.slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Section 1 — scraper bar at top */}
      <ScraperBar />

      {/* Section 2 — two rows of four metric cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          label="Leads in queue"
          value={String(m?.leadsInQueue ?? 0)}
          context="uncontacted, ready to send"
          tone="blue"
        />
        <MetricCard
          label="Contacted this week"
          value={String(m?.contactedThisWeek ?? 0)}
          context="awaiting reply"
          tone="purple"
        />
        <MetricCard
          label="Interested"
          value={String(m?.interested ?? 0)}
          context="unactioned replies"
          tone="green"
        />
        <MetricCard
          label="Revenue MTD"
          value={`$${((m?.revenueMtdCents ?? 0) / 100).toLocaleString()}`}
          context="month to date"
          tone="green"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          label="Emails sent today"
          value={String(m?.emailsSentToday ?? 0)}
          context="last 24 hours"
        />
        <MetricCard
          label="Reply rate this week"
          value={`${m?.replyRateThisWeek ?? 0}%`}
          context="replies / emails sent"
        />
        <MetricCard
          label="Follow-ups due today"
          value={String(m?.followupsDueToday ?? 0)}
          context="from follow-up queue"
          tone="amber"
        />
        <MetricCard
          label="Deals closed this month"
          value={String(m?.dealsClosedThisMonth ?? 0)}
          context="won and beyond"
        />
      </div>

      {/* Section 3 — needs your attention feed */}
      <div>
        <SectionLabel>Needs your attention</SectionLabel>
        {top.length === 0 ? (
          <div className="text-[12px] text-faint py-8 text-center">All caught up.</div>
        ) : (
          <div className="space-y-2">
            {top.map((i) => (
              <PriorityCard
                key={i.key}
                tone={i.tone}
                title={i.title}
                subtitle={i.subtitle}
                chips={i.chips}
                badge={i.badge}
                actions={
                  <button className="btn-primary" onClick={i.onAction}>
                    {i.actionLabel}
                  </button>
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
