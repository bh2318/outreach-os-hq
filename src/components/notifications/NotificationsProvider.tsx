import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type YesNotification = {
  id: string;
  business_name: string;
  type?: string | null;
  read?: boolean | null;
  acted_on?: boolean | null;
  reply_body?: string | null;
  reply_preview: string | null;
  reply_full: string | null;
  lead_id: string | null;
  mock_site_id: string | null;
  status: string;
  created_at: string;
};

type Ctx = {
  active: YesNotification | null;
  showNow: (n: YesNotification) => void;
  openOverlayFor: (n: YesNotification) => void;
  overlayFor: YesNotification | null;
  closeOverlay: () => void;
  dismiss: (id: string) => Promise<void>;
};

const NotificationsContext = createContext<Ctx | null>(null);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<YesNotification[]>([]);
  const [overlayFor, setOverlayFor] = useState<YesNotification | null>(null);
  const seen = useState(() => new Set<string>())[0];

  const showNow = useCallback((n: YesNotification) => {
    const normalized = {
      ...n,
      reply_preview: n.reply_preview ?? n.reply_body?.trim().split(/\r?\n/)[0].slice(0, 240) ?? null,
      reply_full: n.reply_full ?? n.reply_body ?? null,
      status: n.status ?? "unread",
      created_at: n.created_at ?? new Date().toISOString(),
    };
    seen.add(normalized.id);
    setQueue((prev) => [normalized, ...prev.filter((x) => x.id !== normalized.id)]);
  }, [seen]);

  const refetch = useCallback(async () => {
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("type", "yes_reply")
      .eq("read", false)
      .eq("acted_on", false)
      .order("created_at", { ascending: false })
      .limit(20);
    if (!data) return;
    const fresh = (data as YesNotification[]).filter((n) => !seen.has(n.id));
    if (fresh.length) {
      fresh.forEach((n) => seen.add(n.id));
      setQueue((prev) => [...fresh.reverse().map((n) => ({
        ...n,
        reply_preview: n.reply_preview ?? n.reply_body?.trim().split(/\r?\n/)[0].slice(0, 240) ?? null,
        reply_full: n.reply_full ?? n.reply_body ?? null,
      })), ...prev]);
    }
  }, [seen]);

  useEffect(() => {
    refetch();
    const ch = supabase
      .channel("notifications-feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: "read=eq.false" },
        (payload) => {
          console.log("notifications realtime event", payload);
          const n = payload.new as any as YesNotification & { kind?: string };
          if ((n.type ?? n.kind) !== "yes_reply" || n.read === true || n.acted_on === true) return;
          if (seen.has(n.id)) return;
          showNow(n);
        },
      )
      .subscribe();
    const id = window.setInterval(refetch, 8000);
    return () => {
      supabase.removeChannel(ch);
      window.clearInterval(id);
    };
  }, [refetch, seen]);

  const dismiss = useCallback(async (id: string) => {
    setQueue((prev) => prev.filter((n) => n.id !== id));
    await supabase.from("notifications").update({ status: "dismissed", read: true }).eq("id", id);
  }, []);

  const openOverlayFor = useCallback((n: YesNotification) => {
    setOverlayFor(n);
    setQueue((prev) => prev.filter((x) => x.id !== n.id));
  }, []);

  const closeOverlay = useCallback(() => setOverlayFor(null), []);

  const active = queue[0] ?? null;

  return (
    <NotificationsContext.Provider value={{ active, showNow, openOverlayFor, overlayFor, closeOverlay, dismiss }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications must be used inside NotificationsProvider");
  return ctx;
}
