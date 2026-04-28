import { useNotifications } from "./NotificationsProvider";

export function YesNotificationToast() {
  const { active, openOverlayFor, dismiss } = useNotifications();
  if (!active) return null;

  return (
    <div
      className="fixed top-4 right-4 z-[100] w-[360px] max-w-[calc(100vw-2rem)] rounded-xl shadow-2xl animate-in slide-in-from-top-2 fade-in duration-300"
      style={{
        backgroundColor: "#1a1830",
        border: "1px solid #3C3489",
        color: "#e2e0da",
      }}
      role="alert"
    >
      <div className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: "#7c5cff" }}
          />
          <span className="text-[11px] uppercase tracking-wider opacity-70">
            New YES reply
          </span>
        </div>
        <div className="font-bold text-base mb-1" style={{ color: "#e2e0da" }}>
          {active.business_name}
        </div>
        <div className="text-sm opacity-85 mb-4 line-clamp-2">
          "{active.reply_preview}"
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => openOverlayFor(active)}
            className="flex-1 px-3 py-2 rounded-md text-sm font-medium transition-opacity hover:opacity-90"
            style={{ backgroundColor: "#3C3489", color: "#e2e0da" }}
          >
            View and Respond
          </button>
          <button
            onClick={() => dismiss(active.id)}
            className="px-3 py-2 rounded-md text-sm font-medium transition-colors"
            style={{
              backgroundColor: "transparent",
              border: "1px solid #3C3489",
              color: "#e2e0da",
            }}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
