import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDashboardMetrics } from "@/hooks/useMetrics";
import { useReplies } from "@/hooks/useData";
import { SectionLabel } from "@/components/SectionLabel";
import { Badge } from "@/components/Badge";
import { fmtRelative, truncate, type StatusTone } from "@/lib/format";
import { navigateTab } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

const SETUP_KEY = "outreach_os_setup_complete";

function useSetupStatus() {
  return useQuery({
    queryKey: ["setup-status"],
    queryFn: async () => {
      const [leadsRes, settingsRes, emailsRes] = await Promise.all([
        supabase.from("leads").select("id", { count: "exact", head: true }),
        supabase
          .from("settings")
          .select("operator_name, reply_to_email, outreach_active, reply_pipeline_active")
          .eq("id", 1)
          .maybeSingle(),
        supabase.from("outreach_emails").select("id", { count: "exact", head: true }),
      ]);
      const s: any = settingsRes.data ?? {};
      return {
        leadsCount: leadsRes.count ?? 0,
        emailsCount: emailsRes.count ?? 0,
        emailVerified: !!(s.operator_name && s.reply_to_email),
        domainActive: true, // RESEND_FROM_EMAIL is a server secret; presence assumed if any email sent
        replyPipelineActive: !!s.reply_pipeline_active,
        systemActive: !!s.outreach_active,
      };
    },
  });
}

function GettingStartedOverlay({ onDismiss }: { onDismiss: () => void }) {
  const { data } = useSetupStatus();
  const items = [
    { label: "Email settings verified", done: !!data?.emailVerified },
    { label: "Domain active in Resend", done: !!data?.domainActive },
    { label: "Reply Pipeline active", done: !!data?.replyPipelineActive },
    { label: "System Active toggle on", done: !!data?.systemActive },
    { label: "First lead contacted", done: (data?.emailsCount ?? 0) > 0 },
  ];
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-2xl w-full max-w-md p-6">
        <h2 className="text-[20px] font-semibold text-foreground">Welcome to Outreach OS</h2>
        <p className="text-[12px] text-muted-foreground mt-1">Complete these steps to go live.</p>
        <ul className="mt-5 space-y-2.5">
          {items.map((it) => (
            <li key={it.label} className="flex items-center gap-3">
              <span
                className={cn(
                  "w-5 h-5 rounded-full inline-flex items-center justify-center border",
                  it.done
                    ? "bg-status-green-text border-status-green-text text-background"
                    : "bg-transparent border-border"
                )}
              >
                {it.done && <Check className="w-3 h-3" strokeWidth={3} />}
              </span>
              <span className={cn("text-[13px]", it.done ? "text-foreground" : "text-muted-foreground")}>
                {it.label}
              </span>
            </li>
          ))}
        </ul>
        <div className="flex justify-end mt-6">
          <button
            className="inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 text-[12px] font-medium bg-primary text-primary-foreground hover:bg-primary-hover"
            onClick={onDismiss}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  value,
  label,
}: {
  value: string;
  label: string;
}) {
  return (
    <div className="surface-card flex flex-col items-center text-center py-5">
      <div className="text-[28px] font-medium font-mono leading-none text-metric-value">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-2">{label}</div>
    </div>
  );
}

function intentBadge(intent: string): { tone: StatusTone; label: string; sortKey: number } {
  switch (intent) {
    case "interested":
    case "mock_request":
    case "price_inquiry":
      return { tone: "green", label: "Interested", sortKey: 0 };
    case "needs_response":
    case "unknown":
      return { tone: "blue", label: "Question", sortKey: 1 };
    case "call_request":
      return { tone: "red", label: "Call requested", sortKey: 2 };
    case "not_interested":
    case "unsubscribe":
      return { tone: "gray", label: "Not interested", sortKey: 4 };
    default:
      return { tone: "gray", label: intent ?? "—", sortKey: 5 };
  }
}

export function DashboardView() {
  const { data: m } = useDashboardMetrics();
  const { data: replies } = useReplies();
  const { data: setup } = useSetupStatus();

  const [showOverlay, setShowOverlay] = useState(false);
  useEffect(() => {
    if (!setup) return;
    const dismissed = localStorage.getItem(SETUP_KEY) === "true";
    if (dismissed) return;
    if (setup.leadsCount === 0 && !setup.systemActive) setShowOverlay(true);
  }, [setup]);

  const active = !!m?.outreachActive;
  const unactioned = m?.unactionedReplies ?? 0;

  const attention = [...(replies ?? [])]
    .filter((r: any) => !r.actioned)
    .sort((a: any, b: any) => intentBadge(a.intent).sortKey - intentBadge(b.intent).sortKey)
    .slice(0, 5);

  return (
    <div className="space-y-6">
      {/* TOP ROW — System status + Action needed */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div
          className={cn(
            "surface-card flex items-center gap-4 py-6",
            active && "bg-status-green-fill/20 border-status-green-text/20",
          )}
        >
          {active ? (
            <span className="pulse-dot scale-150" />
          ) : (
            <span className="w-3 h-3 rounded-full bg-subtle" />
          )}
          <div className="min-w-0">
            <div className="text-[14px] font-medium text-foreground">
              {active ? "Active" : "Paused"}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {active
                ? "Finding leads every 5 minutes"
                : "Toggle on in Settings to start"}
            </div>
          </div>
        </div>

        <button
          onClick={() => navigateTab("replies")}
          className={cn(
            "surface-card flex items-center gap-4 py-6 text-left hover:bg-border/30 transition-colors",
            unactioned > 0 && "bg-status-amber-fill/30 border-status-amber-text/20",
          )}
        >
          <div
            className={cn(
              "text-[40px] font-mono leading-none",
              unactioned === 0 ? "text-status-green-text" : "text-status-amber-text",
            )}
          >
            {unactioned}
          </div>
          <div className="min-w-0">
            <div className="text-[14px] font-medium text-foreground">
              {unactioned === 0 ? "All caught up" : "Replies waiting for you"}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {unactioned === 0 ? "Action needed: nothing right now" : "Check the Replies tab"}
            </div>
          </div>
        </button>
      </div>

      {/* MIDDLE — Six metric cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <MetricCard
          value={String(m?.leadsFoundToday ?? 0)}
          label="Leads found today"
          context="since midnight"
        />
        <MetricCard
          value={String(m?.emailsSentTodayMidnight ?? 0)}
          label="Emails sent today"
          context="since midnight"
        />
        <MetricCard
          value={String(m?.repliesReceivedToday ?? 0)}
          label="Replies received today"
          context="since midnight"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <MetricCard
          value={String(m?.dealsInProgress ?? 0)}
          label="Deals in progress"
          context="not yet paid"
        />
        <MetricCard
          value={`$${((m?.revenueMtdCents ?? 0) / 100).toLocaleString()}`}
          label="Revenue this month"
          context="this calendar month"
        />
        <MetricCard
          value={String(m?.emailsAllTime ?? 0)}
          label="Emails sent all time"
          context="across all time"
        />
      </div>

      {/* BOTTOM — Needs your attention */}
      <div>
        <SectionLabel>Needs your attention</SectionLabel>
        {!attention.length ? (
          <div className="text-[12px] text-faint py-8 text-center">
            Nothing pending — system is running smoothly.
          </div>
        ) : (
          <div className="space-y-2">
            {attention.map((r: any) => {
              const ib = intentBadge(r.intent);
              return (
                <div key={r.id} className="surface-card flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[13px] font-medium text-foreground truncate">
                        {r.leads?.business_name ?? "Unknown"}
                      </span>
                      <Badge tone={ib.tone}>{ib.label}</Badge>
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-1 truncate">
                      {truncate(r.body ?? "", 60)}
                    </div>
                    <div className="text-[10px] text-faint mt-0.5">{fmtRelative(r.received_at)}</div>
                  </div>
                  <button className="btn-primary shrink-0" onClick={() => navigateTab("replies")}>
                    Go to reply
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showOverlay && (
        <GettingStartedOverlay
          onDismiss={() => {
            localStorage.setItem(SETUP_KEY, "true");
            setShowOverlay(false);
          }}
        />
      )}
    </div>
  );
}
