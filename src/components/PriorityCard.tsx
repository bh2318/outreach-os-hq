import { cn } from "@/lib/utils";
import { toneBarBg, type StatusTone } from "@/lib/format";

interface Props {
  tone: StatusTone;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  chips?: React.ReactNode;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  accentLeft?: boolean; // hot lead extra accent
  className?: string;
}

export function PriorityCard({ tone, title, subtitle, chips, badge, actions, accentLeft, className }: Props) {
  return (
    <div className={cn("surface-card relative", className)} style={accentLeft ? { boxShadow: "inset 3px 0 0 hsl(var(--primary))" } : undefined}>
      <div className={cn("priority-bar", toneBarBg[tone])} />
      <div className="flex items-start justify-between gap-3 pl-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="text-[13px] font-medium text-foreground truncate">{title}</div>
            {badge}
          </div>
          {subtitle && <div className="text-[11px] text-muted-foreground mt-1 truncate">{subtitle}</div>}
          {chips && <div className="flex items-center gap-1.5 flex-wrap mt-2">{chips}</div>}
        </div>
        {actions && <div className="flex items-center gap-1.5 shrink-0">{actions}</div>}
      </div>
    </div>
  );
}
