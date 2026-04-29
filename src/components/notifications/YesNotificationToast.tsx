import { useNotifications } from "./NotificationsProvider";

const KIND_META: Record<string, { label: string; accent: string; primaryLabel: string }> = {
  yes_reply: { label: "New YES reply", accent: "#7c5cff", primaryLabel: "View and Respond" },
  maybe_reply: { label: "New MAYBE reply", accent: "#f5b14a", primaryLabel: "Draft response" },
  no_reply: { label: "Lead said no", accent: "#9aa0a6", primaryLabel: "Review" },
};

export function YesNotificationToast() {
  const { active, openOverlayFor, dismiss } = useNotifications();
  if (!active) return null;
  const kind = (active as any).type ?? (active as any).kind ?? "yes_reply";
  const meta = KIND_META[kind] ?? KIND_META.yes_reply;

  return (
    <div
      className="fixed z-[100] rounded-xl shadow-2xl animate-in fade-in duration-300
                 top-4 right-4 w-[360px] max-w-[calc(100vw-2rem)] slide-in-from-top-2
                 max-md:top-auto max-md:bottom-4 max-md:left-4 max-md:right-4 max-md:w-auto max-md:slide-in-from-bottom-2"
      style={{
        backgroundColor: "#1a1830",
        border: `1px solid ${meta.accent}`,
        color: "#e2e0da",
      }}
      role="alert"
    >
      <div className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: meta.accent }} />
          <span className="text-[11px] uppercase tracking-wider opacity-70">{meta.label}</span>
        </div>
        <div className="font-bold text-base mb-1" style={{ color: "#e2e0da" }}>
          {active.business_name}
        </div>
        <div className="text-sm opacity-85 mb-4 line-clamp-2">"{active.reply_preview}"</div>
        <div className="flex gap-2">
          <button
            onClick={() => openOverlayFor(active)}
            className="flex-1 px-3 py-2 rounded-md text-sm font-medium transition-opacity hover:opacity-90"
            style={{ backgroundColor: meta.accent, color: "#0e0c1c" }}
          >
            {meta.primaryLabel}
          </button>
          <button
            onClick={() => dismiss(active.id)}
            className="px-3 py-2 rounded-md text-sm font-medium transition-colors"
            style={{ backgroundColor: "transparent", border: `1px solid ${meta.accent}`, color: "#e2e0da" }}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
