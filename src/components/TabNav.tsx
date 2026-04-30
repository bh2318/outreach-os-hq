import { cn } from "@/lib/utils";
import { useTabBadges } from "@/hooks/useMetrics";
import { Badge } from "./Badge";
import type { StatusTone } from "@/lib/format";

export type TabId =
  | "dashboard"
  | "leads"
  | "calls"
  | "mocks"
  | "replies"
  | "followups"
  | "pipeline"
  | "activity"
  | "settings";

const TABS: { id: TabId; label: string; badgeKey?: "leads" | "calls" | "mocks" | "replies" | "followups"; tone?: StatusTone }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "leads", label: "Leads", badgeKey: "leads", tone: "blue" },
  { id: "calls", label: "Calls", badgeKey: "calls", tone: "red" },
  { id: "mocks", label: "Mock Studio", badgeKey: "mocks", tone: "amber" },
  { id: "replies", label: "Replies", badgeKey: "replies", tone: "green" },
  { id: "followups", label: "Follow-Ups", badgeKey: "followups", tone: "amber" },
  { id: "pipeline", label: "Pipeline" },
  { id: "activity", label: "Activity Log" },
  { id: "settings", label: "Settings" },
];

export function TabNav({ active, onChange }: { active: TabId; onChange: (id: TabId) => void }) {
  const { data: badges } = useTabBadges();
  return (
    <div className="border-b border-border bg-background sticky top-12 z-20">
      <div className="flex items-center px-4 gap-1 overflow-x-auto whitespace-nowrap">
        {TABS.map((t) => {
          const count = t.badgeKey ? badges?.[t.badgeKey] ?? 0 : 0;
          const isActive = active === t.id;
          return (
            <button
              key={t.id}
              onClick={() => onChange(t.id)}
              className={cn(
                "relative px-3 py-2.5 text-[12px] flex items-center gap-1.5 transition-colors",
                isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t.label}
              {t.badgeKey && count > 0 && t.tone && <Badge tone={t.tone}>{count}</Badge>}
              {isActive && <span className="absolute left-0 right-0 -bottom-px h-[2px] bg-primary-hover" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
