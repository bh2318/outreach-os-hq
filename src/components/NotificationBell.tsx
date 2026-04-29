import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fmtRelative, truncate } from "@/lib/format";
import { navigateTab } from "@/lib/nav";
import { cn } from "@/lib/utils";

type N = {
  id: string;
  business_name: string;
  reply_body: string | null;
  reply_preview: string | null;
  type: string | null;
  created_at: string;
  read: boolean;
  acted_on: boolean;
};

export function NotificationBell() {
  const [items, setItems] = useState<N[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  async function load() {
    const { data } = await supabase
      .from("notifications")
      .select("id,business_name,reply_body,reply_preview,type,created_at,read,acted_on")
      .eq("read", false)
      .eq("acted_on", false)
      .order("created_at", { ascending: false })
      .limit(10);
    setItems((data ?? []) as N[]);
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel("bell-notifications")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications" },
        () => load(),
      )
      .subscribe();
    const id = window.setInterval(load, 15000);
    return () => {
      supabase.removeChannel(ch);
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const count = items.length;

  async function openItem(n: N) {
    await supabase.from("notifications").update({ read: true }).eq("id", n.id);
    setOpen(false);
    setItems((prev) => prev.filter((x) => x.id !== n.id));
    navigateTab("replies");
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "relative w-7 h-7 rounded-md flex items-center justify-center hover:bg-border transition-colors",
          count > 0 && "animate-pulse",
        )}
        aria-label="Notifications"
      >
        <Bell size={14} className="text-muted-foreground" />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-[3px] rounded-full bg-destructive text-[9px] font-medium text-destructive-foreground flex items-center justify-center font-mono">
            {count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-9 w-[340px] rounded-md border border-border bg-surface shadow-xl z-50 overflow-hidden animate-fade-in">
          <div className="px-3 py-2 border-b border-border-faint flex items-center justify-between">
            <span className="text-[11px] font-medium text-foreground">Notifications</span>
            <span className="text-[10px] text-faint font-mono">{count} unread</span>
          </div>
          {count === 0 ? (
            <div className="px-3 py-6 text-center text-[11px] text-faint">No unread notifications.</div>
          ) : (
            <div className="max-h-[400px] overflow-y-auto">
              {items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => openItem(n)}
                  className="w-full text-left px-3 py-2.5 hover:bg-border/50 border-b border-border-faint last:border-0 transition-colors"
                >
                  <div className="text-[13px] font-bold text-foreground truncate">{n.business_name}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                    {truncate(n.reply_preview ?? n.reply_body ?? "", 80)}
                  </div>
                  <div className="text-[10px] text-faint mt-1">{fmtRelative(n.created_at)}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
