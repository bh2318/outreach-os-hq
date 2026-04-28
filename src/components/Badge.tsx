import { cn } from "@/lib/utils";
import { toneClasses, type StatusTone } from "@/lib/format";

export function Badge({ tone, children, className }: { tone: StatusTone; children: React.ReactNode; className?: string }) {
  return <span className={cn("badge-pill", toneClasses[tone], className)}>{children}</span>;
}
