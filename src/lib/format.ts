export type StatusTone = "red" | "amber" | "blue" | "green" | "gray" | "purple";

export const toneClasses: Record<StatusTone, string> = {
  red: "text-status-red-text bg-status-red-fill",
  amber: "text-status-amber-text bg-status-amber-fill",
  blue: "text-status-blue-text bg-status-blue-fill",
  green: "text-status-green-text bg-status-green-fill",
  gray: "text-status-gray-text bg-status-gray-fill",
  purple: "text-primary-fill-text bg-primary-fill",
};

export const toneBarBg: Record<StatusTone, string> = {
  red: "bg-status-red-text",
  amber: "bg-status-amber-text",
  blue: "bg-status-blue-text",
  green: "bg-status-green-text",
  gray: "bg-subtle",
  purple: "bg-primary-hover",
};

export function fmtMoney(cents?: number | null): string {
  if (cents == null) return "—";
  return "$" + (cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export function fmtRelative(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function fmtTime(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function truncate(s: string, n: number): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n).trimEnd() + "…" : s;
}
