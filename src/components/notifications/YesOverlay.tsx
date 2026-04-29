import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNotifications } from "./NotificationsProvider";
import { toast } from "sonner";

type Lead = {
  id: string;
  business_name: string;
  owner_name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  county: string | null;
  niche: string | null;
  website_url: string | null;
  site_score: number | null;
  site_audit_json: any;
  status: string | null;
};

type Kind = "yes_reply" | "maybe_reply" | "no_reply";

const KIND_META: Record<Kind, { label: string; accent: string; rightLabel: string }> = {
  yes_reply: { label: "YES reply", accent: "#7c5cff", rightLabel: "Drafted YES response" },
  maybe_reply: { label: "MAYBE reply", accent: "#f5b14a", rightLabel: "Drafted response" },
  no_reply: { label: "NO reply", accent: "#9aa0a6", rightLabel: "Lead archived" },
};

export function YesOverlay() {
  const { overlayFor, closeOverlay } = useNotifications();
  const [lead, setLead] = useState<Lead | null>(null);
  const [draft, setDraft] = useState("");
  const [subject, setSubject] = useState("");
  const [mockUrl, setMockUrl] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const open = !!overlayFor;
  const kind: Kind = ((overlayFor as any)?.type ?? (overlayFor as any)?.kind ?? "yes_reply") as Kind;
  const meta = KIND_META[kind] ?? KIND_META.yes_reply;
  const showDraft = kind !== "no_reply";

  async function loadDraft(leadId: string, replyText: string) {
    setLoading(true);
    try {
      const fnName = kind === "yes_reply" ? "draft-yes-response" : "draft-maybe-response";
      const { data, error } = await supabase.functions.invoke(fnName, {
        body: { leadId, replyText },
      });
      if (error) throw error;
      if (data?.success) {
        setDraft(data.draft);
        setSubject(data.subject ?? "");
      } else {
        toast.error(data?.error ?? "Failed to draft response");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to draft response");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!overlayFor) {
      setLead(null);
      setDraft("");
      setSubject("");
      setMockUrl(null);
      setEditing(false);
      return;
    }
    (async () => {
      if (overlayFor.lead_id) {
        const { data } = await supabase.from("leads").select("*").eq("id", overlayFor.lead_id).single();
        if (data) setLead(data as Lead);
      }
      if (overlayFor.mock_site_id) {
        const { data } = await supabase
          .from("mock_sites")
          .select("preview_url")
          .eq("id", overlayFor.mock_site_id)
          .single();
        if (data?.preview_url) setMockUrl(data.preview_url);
      }
      if (overlayFor.lead_id && showDraft) {
        loadDraft(overlayFor.lead_id, overlayFor.reply_full ?? overlayFor.reply_body ?? "");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlayFor]);

  if (!open) return null;

  const reviewCount = lead?.site_audit_json?.review_count ?? "—";
  const rating = lead?.site_audit_json?.rating ?? "—";

  async function handleSend() {
    if (!overlayFor?.lead_id) return;
    setSending(true);
    try {
      const fnName = kind === "yes_reply" ? "send-yes-response" : "send-maybe-response";
      const body: any = {
        leadId: overlayFor.lead_id,
        notificationId: overlayFor.id,
        draft,
        subject,
      };
      if (kind === "yes_reply") body.mockSiteId = overlayFor.mock_site_id;
      if (kind === "maybe_reply") body.replyId = null;
      const { data, error } = await supabase.functions.invoke(fnName, { body });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error ?? "Send failed");
      await supabase
        .from("notifications")
        .update({ status: "acted", acted_at: new Date().toISOString(), read: true, acted_on: true })
        .eq("id", overlayFor.id);
      toast.success(kind === "yes_reply" ? "YES response sent — mock delivered" : "Response sent");
      closeOverlay();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to send");
    } finally {
      setSending(false);
    }
  }

  async function handleAcknowledgeNo() {
    if (!overlayFor) return;
    await supabase
      .from("notifications")
      .update({ status: "acted", acted_at: new Date().toISOString(), read: true, acted_on: true })
      .eq("id", overlayFor.id);
    toast.success("Lead archived");
    closeOverlay();
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-stretch"
      style={{ backgroundColor: "rgba(8,7,18,0.92)" }}
    >
      <div className="w-full h-full grid grid-cols-1 md:grid-cols-2 gap-0">
        {/* LEFT: lead details */}
        <div className="p-8 overflow-y-auto" style={{ borderRight: "1px solid #2a2545" }}>
          <div className="flex items-center justify-between mb-6">
            <span
              className="text-[11px] uppercase tracking-wider px-2 py-1 rounded"
              style={{ backgroundColor: "#1a1830", color: meta.accent, border: `1px solid ${meta.accent}` }}
            >
              {meta.label}
            </span>
            <button onClick={closeOverlay} className="text-foreground/60 hover:text-foreground text-sm">
              ✕ Close
            </button>
          </div>

          <h1 className="text-3xl font-bold mb-1" style={{ color: "#e2e0da" }}>
            {lead?.business_name ?? overlayFor.business_name}
          </h1>
          <div className="text-sm opacity-70 mb-6" style={{ color: "#e2e0da" }}>
            {lead?.niche} · {lead?.city}, {lead?.state}
          </div>

          <dl className="space-y-3 text-sm" style={{ color: "#e2e0da" }}>
            <Row label="Owner" value={lead?.owner_name ?? "—"} />
            <Row label="County" value={lead?.county ?? "—"} />
            <Row label="Phone" value={lead?.phone ?? "—"} />
            <Row label="Email" value={lead?.email ?? "—"} />
            <Row label="Website" value={lead?.website_url ?? "(none)"} />
            <Row label="Site score" value={lead?.site_score != null ? `${lead.site_score}/100` : "—"} />
            <Row label="Reviews" value={`${reviewCount} @ ${rating}★`} />
          </dl>

          <div className="mt-8">
            <div className="text-[11px] uppercase tracking-wider opacity-60 mb-2">Their reply</div>
            <div
              className="rounded-lg p-4 text-sm whitespace-pre-wrap"
              style={{ backgroundColor: "#1a1830", border: "1px solid #2a2545", color: "#e2e0da" }}
            >
              {overlayFor.reply_full}
            </div>
          </div>

          {mockUrl && (
            <div className="mt-6">
              <div className="text-[11px] uppercase tracking-wider opacity-60 mb-2">Mock site</div>
              <a
                href={mockUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sm underline break-all"
                style={{ color: meta.accent }}
              >
                {mockUrl}
              </a>
            </div>
          )}
        </div>

        {/* RIGHT */}
        <div className="p-8 overflow-y-auto flex flex-col" style={{ backgroundColor: "#0e0c1c" }}>
          <div className="flex items-center justify-between mb-6">
            <span
              className="text-[11px] uppercase tracking-wider px-2 py-1 rounded"
              style={{ backgroundColor: "#1a1830", color: meta.accent, border: `1px solid ${meta.accent}` }}
            >
              {meta.rightLabel}
            </span>
            <span className="text-xs opacity-60" style={{ color: "#e2e0da" }}>
              {showDraft ? "Auto-drafted by Claude" : "No reply needed"}
            </span>
          </div>

          {kind === "no_reply" ? (
            <div className="flex-1 flex flex-col">
              <div
                className="rounded-lg p-6 text-sm"
                style={{ backgroundColor: "#1a1830", border: "1px solid #2a2545", color: "#e2e0da" }}
              >
                <p className="mb-3 font-medium">This lead said no.</p>
                <p className="opacity-80">
                  The lead has been archived automatically. No further outreach will be sent.
                  Acknowledge to dismiss.
                </p>
              </div>
              <div className="mt-auto flex gap-2 pt-6">
                <button
                  onClick={handleAcknowledgeNo}
                  className="ml-auto px-5 py-2 rounded-md text-sm font-semibold"
                  style={{ backgroundColor: meta.accent, color: "#0e0c1c" }}
                >
                  Acknowledge
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="mb-3">
                <label className="text-[11px] uppercase tracking-wider opacity-60 mb-1 block">Subject</label>
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  disabled={!editing}
                  className="w-full rounded-md px-3 py-2 text-sm disabled:opacity-90"
                  style={{ backgroundColor: "#1a1830", border: "1px solid #2a2545", color: "#e2e0da" }}
                />
              </div>

              <div className="flex-1 mb-4">
                <label className="text-[11px] uppercase tracking-wider opacity-60 mb-1 block">Body</label>
                <textarea
                  value={loading ? "Drafting…" : draft}
                  onChange={(e) => setDraft(e.target.value)}
                  disabled={!editing || loading}
                  rows={16}
                  className="w-full h-full rounded-md px-3 py-3 text-sm font-sans resize-none"
                  style={{ backgroundColor: "#1a1830", border: "1px solid #2a2545", color: "#e2e0da", minHeight: "320px" }}
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() =>
                    overlayFor.lead_id &&
                    loadDraft(overlayFor.lead_id, overlayFor.reply_full ?? overlayFor.reply_body ?? "")
                  }
                  disabled={loading || sending}
                  className="px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50"
                  style={{ backgroundColor: "transparent", border: "1px solid #3C3489", color: "#e2e0da" }}
                >
                  {loading ? "Regenerating…" : "Regenerate"}
                </button>
                <button
                  onClick={() => setEditing((v) => !v)}
                  disabled={loading || sending}
                  className="px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50"
                  style={{ backgroundColor: "transparent", border: "1px solid #3C3489", color: "#e2e0da" }}
                >
                  {editing ? "Lock" : "Edit"}
                </button>
                <button
                  onClick={handleSend}
                  disabled={loading || sending || !draft}
                  className="ml-auto px-5 py-2 rounded-md text-sm font-semibold disabled:opacity-50"
                  style={{ backgroundColor: meta.accent, color: "#0e0c1c" }}
                >
                  {sending ? "Sending…" : "Confirm and Send"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex">
      <dt className="w-28 text-[11px] uppercase tracking-wider opacity-60 pt-0.5">{label}</dt>
      <dd className="flex-1 text-sm break-words">{value}</dd>
    </div>
  );
}
