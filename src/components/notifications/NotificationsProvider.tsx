import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type YesNotification = {
  id: string;
  business_name: string;
  reply_preview: string | null;
  reply_full: string | null;
  lead_id: string | null;
  mock_site_id: string | null;
  status: string;
  created_at: string;
};

type Ctx = {
  active: YesNotification | null;
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

  const refetch = useCallback(async () => {
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("kind", "yes_reply")
      .eq("status", "unread")
      .order("created_at", { ascending: false })
      .limit(20);
    if (!data) return;
    const fresh = (data as YesNotification[]).filter((n) => !seen.has(n.id));
    if (fresh.length) {
      fresh.forEach((n) => seen.add(n.id));
      setQueue((prev) => [...fresh.reverse(), ...prev]);
    }
  }, [seen]);

  useEffect(() => {
    refetch();
    const ch = supabase
      .channel("notifications-feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications" },
        (payload) => {
          const n = payload.new as YesNotification;
          if (n.kind !== ("yes_reply" as any) && (n as any).kind !== "yes_reply") return;
          if (seen.has(n.id)) return;
          seen.add(n.id);
          setQueue((prev) => [n, ...prev]);
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
    await supabase.from("notifications").update({ status: "dismissed" }).eq("id", id);
  }, []);

  const openOverlayFor = useCallback((n: YesNotification) => {
    setOverlayFor(n);
    setQueue((prev) => prev.filter((x) => x.id !== n.id));
  }, []);

  const closeOverlay = useCallback(() => setOverlayFor(null), []);

  const active = queue[0] ?? null;

  return (
    <NotificationsContext.Provider value={{ active, openOverlayFor, overlayFor, closeOverlay, dismiss }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications must be used inside NotificationsProvider");
  return ctx;
}
