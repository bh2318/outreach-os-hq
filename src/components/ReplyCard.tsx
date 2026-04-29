import { Badge } from "./Badge";
import { Chip } from "./Chip";
import { PriorityCard } from "./PriorityCard";
import { useRecordAction } from "@/hooks/useData";
import { useNotifications } from "./notifications/NotificationsProvider";
import { supabase } from "@/integrations/supabase/client";
import { fmtRelative, truncate, type StatusTone } from "@/lib/format";
import { navigateTab } from "@/lib/nav";
import { logActivity } from "@/lib/activity";
import { toast } from "sonner";

const intentMeta: Record<string, { tone: StatusTone; label: string; group: "hot" | "maybe" | "cold" }> = {
  call_request: { tone: "red", label: "Call requested", group: "hot" },
  interested: { tone: "green", label: "Interested", group: "hot" },
  price_inquiry: { tone: "blue", label: "Price inquiry", group: "maybe" },
  mock_request: { tone: "amber", label: "Mock requested", group: "hot" },
  needs_response: { tone: "blue", label: "Needs reply", group: "maybe" },
  not_interested: { tone: "gray", label: "Not interested", group: "cold" },
  unsubscribe: { tone: "gray", label: "Unsubscribed", group: "cold" },
  angry: { tone: "red", label: "Flagged", group: "cold" },
  unknown: { tone: "amber", label: "Needs review", group: "maybe" },
};

export function ReplyCard({ reply }: { reply: any }) {
  const action = useRecordAction();
  const { openOverlayFor } = useNotifications();
  const lead = reply.leads;
  const meta = intentMeta[reply.intent] ?? intentMeta.unknown;
  const tone = meta.tone;

  function openReplyOverlay() {
    // Construct a notification-shaped object to feed the existing overlay.
    const kind =
      meta.group === "hot" && reply.intent === "interested" ? "yes_reply" :
      meta.group === "cold" ? "no_reply" : "maybe_reply";
    openOverlayFor({
      id: reply.id, // reply id used as a transient overlay id
      business_name: lead?.business_name ?? "Unknown",
      type: kind,
      reply_body: reply.body,
      reply_full: reply.body,
      reply_preview: reply.body?.slice(0, 200) ?? null,
      lead_id: reply.lead_id,
      mock_site_id: null,
      status: "unread",
      created_at: reply.received_at,
      read: false,
      acted_on: false,
    } as any);
  }

  const archive = () => action.mutate({
    table: "replies", id: reply.id, patch: { actioned: true },
    log: { action_type: "replied", business_name: lead?.business_name, detail: "Reply archived", outcome: "warning", lead_id: reply.lead_id },
    toast: "Reply archived",
  });

  async function moveToPipeline() {
    try {
      const { error } = await supabase.from("deals").insert({
        lead_id: reply.lead_id,
        stage: "replied",
        estimated_value: null,
        stage_entered_at: new Date().toISOString(),
      });
      if (error) throw error;
      await supabase.from("replies").update({ actioned: true }).eq("id", reply.id);
      await logActivity({
        action_type: "deal_updated",
        business_name: lead?.business_name,
        lead_id: reply.lead_id,
        detail: "Moved to pipeline at stage replied",
      });
      toast.success("Moved to pipeline");
      navigateTab("pipeline");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to move to pipeline");
    }
  }

  return (
    <PriorityCard
      tone={tone}
      title={
        <span>
          <span className="text-foreground">{lead?.business_name}</span>
          <span className="text-muted-foreground font-normal"> — {truncate(reply.body, 80)}</span>
        </span>
      }
      subtitle={`${reply.from_email} · ${fmtRelative(reply.received_at)}`}
      chips={<><Chip>{lead?.niche} · {lead?.city}</Chip></>}
      badge={<Badge tone={tone}>{meta.label}</Badge>}
      actions={
        <>
          {meta.group === "hot" && (
            <>
              <button className="btn-green" onClick={openReplyOverlay}>Reply</button>
              <button className="btn-ghost" onClick={openReplyOverlay}>View thread</button>
              <button className="btn-ghost" onClick={moveToPipeline}>Move to pipeline</button>
            </>
          )}
          {meta.group === "maybe" && (
            <>
              <button className="btn-primary" onClick={openReplyOverlay}>Reply</button>
              <button className="btn-ghost" onClick={openReplyOverlay}>View thread</button>
            </>
          )}
          {meta.group === "cold" && (
            <button className="btn-ghost" onClick={archive}>Archive</button>
          )}
        </>
      }
    />
  );
}
