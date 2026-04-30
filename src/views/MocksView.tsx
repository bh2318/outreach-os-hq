import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/Badge";
import { Chip } from "@/components/Chip";
import { SectionLabel } from "@/components/SectionLabel";

import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Loader2,
  Star,
  MessageSquareQuote,
  Phone,
  MapPin,
  Tag,
  Image as ImageIcon,
  Check,
  Monitor,
  Smartphone,
  RefreshCw,
  Send,
  X,
  ExternalLink,
} from "lucide-react";

/* ---------- types ---------- */

type Lead = {
  id: string;
  business_name: string;
  city: string | null;
  state: string | null;
  county: string | null;
  niche: string | null;
  phone: string | null;
  email: string | null;
  rating: number | null;
  review_count: number | null;
  website_goal: string | null;
  client_assets: any;
  unsplash_images: any;
  status: string;
};

type MockRow = {
  id: string;
  lead_id: string | null;
  status: string;
  requested_at: string;
  preview_url: string | null;
  generated_at: string | null;
  sent_at: string | null;
  leads?: Lead | null;
};

type UnsplashImage = {
  id: string;
  url: string;
  thumb: string;
  alt: string;
  photographer: string;
  profile_url: string;
};

const ACTIVE_STATUSES = ["mock-requested", "generating", "mock-ready", "mock-sent"];

/* ---------- helpers ---------- */

function avatarColor(niche: string | null | undefined): string {
  const n = (niche || "x").toLowerCase();
  let h = 0;
  for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0;
  const palette = [
    "bg-status-blue-fill text-status-blue-text",
    "bg-status-green-fill text-status-green-text",
    "bg-status-amber-fill text-status-amber-text",
    "bg-status-red-fill text-status-red-text",
    "bg-primary-fill text-primary-fill-text",
  ];
  return palette[h % palette.length];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || name.slice(0, 2).toUpperCase();
}

function statusBadge(status: string) {
  switch (status) {
    case "mock-requested":
      return <Badge tone="blue">Mock requested</Badge>;
    case "generating":
      return (
        <span className="badge-pill bg-status-amber-fill text-status-amber-text inline-flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-status-amber-text animate-pulse" />
          Generating
        </span>
      );
    case "mock-ready":
      return <Badge tone="green">Mock ready</Badge>;
    case "mock-sent":
      return <Badge tone="gray">Sent</Badge>;
    default:
      return <Badge tone="gray">{status}</Badge>;
  }
}

/* ---------- data ---------- */

function useMockStudioLeads() {
  return useQuery({
    queryKey: ["mock-studio-leads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select(
          "id,business_name,city,state,county,niche,phone,email,rating,review_count,website_goal,client_assets,unsplash_images,status,created_at"
        )
        .in("status", ACTIVE_STATUSES)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Lead[];
    },
  });
}

function useMockSiteForLead(leadId: string | null) {
  return useQuery({
    queryKey: ["mock-site", leadId],
    enabled: !!leadId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mock_sites")
        .select("*")
        .eq("lead_id", leadId!)
        .order("requested_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as MockRow | null;
    },
  });
}

/* ---------- main view ---------- */

export function MocksView() {
  const qc = useQueryClient();
  const { data: leads, isLoading } = useMockStudioLeads();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // realtime: any change to leads or mock_sites refreshes
  useEffect(() => {
    const channel = supabase
      .channel("mock-studio-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, () => {
        qc.invalidateQueries({ queryKey: ["mock-studio-leads"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "mock_sites" }, (payload) => {
        const row: any = payload.new ?? payload.old;
        qc.invalidateQueries({ queryKey: ["mock-studio-leads"] });
        if (row?.lead_id) qc.invalidateQueries({ queryKey: ["mock-site", row.lead_id] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  // Auto-select first lead when list loads / current selection disappears.
  useEffect(() => {
    if (!leads?.length) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !leads.find((l) => l.id === selectedId)) {
      setSelectedId(leads[0].id);
    }
  }, [leads, selectedId]);

  const selected = leads?.find((l) => l.id === selectedId) ?? null;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <SectionLabel>Mock Studio</SectionLabel>
        {leads && leads.length > 0 && (
          <span className="text-[10px] text-muted-foreground">
            {leads.length} active {leads.length === 1 ? "lead" : "leads"}
          </span>
        )}
      </div>

      <div className="flex flex-col md:flex-row gap-3">
        {/* LEFT PANEL */}
        <aside className="md:w-[280px] md:flex-shrink-0">
          <div
            className="surface-card p-0 overflow-hidden md:sticky md:top-24"
            style={{ maxHeight: "calc(100vh - 140px)" }}
          >
            <div className="px-3 py-2 border-b border-border label-uppercase">
              Active leads
            </div>
            <div className="overflow-y-auto" style={{ maxHeight: "calc(100vh - 180px)" }}>
              {isLoading ? (
                <div className="p-4 flex items-center justify-center text-muted-foreground text-[11px]">
                  <Loader2 className="w-3 h-3 animate-spin mr-2" /> Loading…
                </div>
              ) : !leads?.length ? (
                <div className="p-4 text-[11px] text-muted-foreground leading-relaxed">
                  Replies from interested businesses will appear here.
                </div>
              ) : (
                leads.map((l) => {
                  const isActive = l.id === selectedId;
                  return (
                    <button
                      key={l.id}
                      onClick={() => setSelectedId(l.id)}
                      className={cn(
                        "w-full text-left flex items-center gap-2.5 px-3 py-2.5 border-b border-border-faint transition-colors",
                        "hover:bg-secondary",
                        isActive
                          ? "bg-primary-fill/40 border-l-2 border-l-primary-hover"
                          : "border-l-2 border-l-transparent"
                      )}
                    >
                      <div
                        className={cn(
                          "w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold flex-shrink-0",
                          avatarColor(l.niche)
                        )}
                      >
                        {initials(l.business_name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[12px] font-semibold text-foreground truncate">
                          {l.business_name}
                        </div>
                        <div className="text-[10px] text-muted-foreground truncate">
                          {[l.city, l.niche].filter(Boolean).join(" · ") || "—"}
                        </div>
                      </div>
                      <div className="flex-shrink-0">{statusBadge(l.status)}</div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </aside>

        {/* RIGHT PANEL */}
        <section className="flex-1 min-w-0">
          {selected ? (
            <Workspace lead={selected} key={selected.id} />
          ) : (
            <div className="surface-card flex items-center justify-center text-muted-foreground text-[12px] py-20">
              Replies from interested businesses will appear here.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/* ---------- workspace ---------- */

function Workspace({ lead }: { lead: Lead }) {
  const qc = useQueryClient();
  const { data: mock } = useMockSiteForLead(lead.id);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [showFinalize, setShowFinalize] = useState(false);

  // Photo selection state
  const clientImages: string[] = useMemo(() => {
    const raw = lead.client_assets;
    if (!Array.isArray(raw)) return [];
    return raw.map((c: any) => (typeof c === "string" ? c : c?.url)).filter(Boolean);
  }, [lead.client_assets]);

  const cachedUnsplash: UnsplashImage[] = useMemo(() => {
    return Array.isArray(lead.unsplash_images) ? (lead.unsplash_images as UnsplashImage[]) : [];
  }, [lead.unsplash_images]);

  const [unsplash, setUnsplash] = useState<UnsplashImage[]>(cachedUnsplash);
  const [unsplashLoading, setUnsplashLoading] = useState(false);
  const [unsplashError, setUnsplashError] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const fetchedFor = useRef<string | null>(null);

  // Auto-fetch Unsplash on mount / lead change.
  useEffect(() => {
    if (fetchedFor.current === lead.id) return;
    fetchedFor.current = lead.id;
    if (cachedUnsplash.length >= 3) {
      setUnsplash(cachedUnsplash);
      setSelected(new Set(cachedUnsplash.slice(0, 3).map((p) => p.url)));
      return;
    }
    setUnsplashLoading(true);
    setUnsplashError(false);
    supabase.functions
      .invoke("unsplash-search", { body: { niche: lead.niche ?? "" } })
      .then(async ({ data, error }) => {
        if (error) throw error;
        const imgs: UnsplashImage[] = (data?.images ?? []) as UnsplashImage[];
        setUnsplash(imgs);
        setSelected(new Set(imgs.slice(0, 3).map((p) => p.url)));
        // Persist to lead
        if (imgs.length) {
          await supabase
            .from("leads")
            .update({ unsplash_images: imgs as any })
            .eq("id", lead.id);
        }
      })
      .catch((e) => {
        console.error("unsplash fetch failed", e);
        setUnsplashError(true);
      })
      .finally(() => setUnsplashLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.id]);

  const toggleSelect = (url: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  };

  const isGenerating = lead.status === "generating" || mock?.status === "generating";
  const hasMock = lead.status === "mock-ready" || lead.status === "mock-sent" || !!mock?.preview_url;

  const handleGenerate = async () => {
    // Optimistic immediate update so UI never freezes (<200ms).
    qc.setQueryData(["mock-studio-leads"], (prev: any) =>
      Array.isArray(prev)
        ? prev.map((l: Lead) => (l.id === lead.id ? { ...l, status: "generating" } : l))
        : prev
    );
    try {
      // Flip DB status right away so the loading state is consistent.
      await supabase.from("leads").update({ status: "generating" }).eq("id", lead.id);
      if (mock?.id) {
        await supabase.from("mock_sites").update({ status: "generating" }).eq("id", mock.id);
      } else {
        await supabase.from("mock_sites").insert({
          lead_id: lead.id,
          status: "generating",
          requested_at: new Date().toISOString(),
        });
      }

      const selectedImageUrls = Array.from(selected);
      // Include client-supplied images first if any
      const allImages = [...clientImages, ...selectedImageUrls];

      // Fire the long-running generation. We do NOT await the response in the
      // UI handler — realtime updates on leads/mock_sites will refresh us when
      // it finishes (success or failure).
      supabase.functions
        .invoke("generate-mock", {
          body: { lead_id: lead.id, selected_images: allImages },
        })
        .then(({ error }) => {
          if (error) {
            console.error("generate-mock error", error);
            toast.error("Mock generation failed — check activity log");
          } else {
            toast.success("Mock website ready");
          }
          qc.invalidateQueries();
        })
        .catch((e) => {
          console.error("generate-mock invoke failed", e);
          toast.error("Mock generation failed");
          qc.invalidateQueries();
        });

      toast.success("Building your mock website…");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to start generation");
    }
  };

  const fullCounty = (() => {
    const c = (lead.county || lead.city || "").trim();
    if (!c) return "";
    return /county$/i.test(c) ? c : `${c} County`;
  })();

  return (
    <div className="space-y-3">
      {/* HEADER */}
      <div className="surface-card">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="text-[18px] font-semibold text-foreground truncate">
              {lead.business_name}
            </div>
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              {lead.city && (
                <Chip>
                  <MapPin className="w-2.5 h-2.5" /> {[lead.city, lead.state].filter(Boolean).join(", ")}
                </Chip>
              )}
              {lead.niche && (
                <Chip>
                  <Tag className="w-2.5 h-2.5" /> {lead.niche}
                </Chip>
              )}
              {lead.phone && (
                <a
                  href={`tel:${lead.phone}`}
                  className="chip hover:text-foreground transition-colors"
                >
                  <Phone className="w-2.5 h-2.5" /> {lead.phone}
                </a>
              )}
              {lead.rating != null && (
                <span className="chip bg-status-amber-fill text-status-amber-text border-status-amber-text/20">
                  <Star className="w-2.5 h-2.5 fill-current" /> {Number(lead.rating).toFixed(1)}
                  {lead.review_count != null && (
                    <span className="opacity-70">({lead.review_count})</span>
                  )}
                </span>
              )}
            </div>
          </div>
          <div className="flex-shrink-0">{statusBadge(lead.status)}</div>
        </div>
      </div>

      {/* WORKSPACE */}
      <div className="flex flex-col lg:flex-row gap-3">
        {/* LEFT COLUMN — controls */}
        <div className="lg:w-[260px] lg:flex-shrink-0 space-y-3">
          {/* Goal */}
          <div>
            <div className="label-uppercase mb-1.5 flex items-center gap-1.5">
              <MessageSquareQuote className="w-3 h-3" /> Their goal
            </div>
            {lead.website_goal ? (
              <div
                className="rounded-md border-l-2 px-3 py-2.5 text-[12px] leading-relaxed text-status-blue-text"
                style={{
                  background: "hsl(var(--status-blue-fill) / 0.6)",
                  borderColor: "hsl(var(--status-blue-text))",
                }}
              >
                {lead.website_goal}
              </div>
            ) : (
              <div className="text-[11px] italic text-muted-foreground">
                No specific goal provided
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-2">
            <div className="surface-card !p-2.5 text-center">
              <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Rating</div>
              <div className="text-[16px] font-semibold text-foreground mt-0.5 flex items-center justify-center gap-1">
                <Star className="w-3 h-3 text-status-amber-text fill-current" />
                {lead.rating != null ? Number(lead.rating).toFixed(1) : "—"}
              </div>
            </div>
            <div className="surface-card !p-2.5 text-center">
              <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Reviews</div>
              <div className="text-[16px] font-semibold text-foreground mt-0.5">
                {lead.review_count ?? "—"}
              </div>
            </div>
          </div>

          {/* Photos */}
          <div>
            <div className="label-uppercase mb-1.5 flex items-center gap-1.5">
              <ImageIcon className="w-3 h-3" /> Select photos to include
            </div>
            {unsplashLoading ? (
              <div className="grid grid-cols-3 gap-1.5">
                {Array.from({ length: 9 }).map((_, i) => (
                  <div
                    key={i}
                    className="rounded-md bg-secondary animate-pulse"
                    style={{ height: 58 }}
                  />
                ))}
              </div>
            ) : unsplashError || unsplash.length === 0 ? (
              <div className="text-[11px] text-muted-foreground italic">
                Photos unavailable — mock will be generated without images.
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-1.5">
                  {unsplash.map((img) => {
                    const isSel = selected.has(img.url);
                    return (
                      <button
                        key={img.id}
                        onClick={() => toggleSelect(img.url)}
                        className={cn(
                          "relative rounded-md overflow-hidden transition-all border",
                          isSel
                            ? "border-primary-hover ring-1 ring-primary-hover"
                            : "border-border opacity-60 hover:opacity-100"
                        )}
                        style={{ height: 58 }}
                        title={img.alt}
                      >
                        <img
                          src={img.thumb}
                          alt={img.alt}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                        {isSel && (
                          <span className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full bg-primary-hover text-white flex items-center justify-center">
                            <Check className="w-2.5 h-2.5" strokeWidth={3} />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <div className="text-[9px] text-muted-foreground mt-1.5">
                  Photos from Unsplash
                </div>
              </>
            )}
          </div>

          {/* Client images */}
          {clientImages.length > 0 && (
            <div>
              <div className="label-uppercase mb-1.5">Images from client</div>
              <div className="grid grid-cols-3 gap-1.5">
                {clientImages.map((url, i) => (
                  <div
                    key={i}
                    className="relative rounded-md overflow-hidden border border-status-green-text/40 ring-1 ring-status-green-text/40"
                    style={{ height: 58 }}
                  >
                    <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" />
                    <span className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full bg-status-green-text text-background flex items-center justify-center">
                      <Check className="w-2.5 h-2.5" strokeWidth={3} />
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Generate button */}
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className={cn(
              "w-full inline-flex items-center justify-center gap-2 rounded-[12px] py-3 text-[14px] font-medium transition-colors",
              "bg-primary text-primary-foreground hover:bg-primary-hover",
              "disabled:opacity-60 disabled:cursor-not-allowed"
            )}
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating
              </>
            ) : hasMock ? (
              <>
                <RefreshCw className="w-3.5 h-3.5" /> Regenerate Mock Website
              </>
            ) : (
              <>Generate Mock Website</>
            )}
          </button>
        </div>

        {/* RIGHT COLUMN — preview */}
        <div className="flex-1 min-w-0">
          <div className="surface-card !p-2 mb-2 flex items-center gap-2">
            {/* device toggle */}
            <div className="inline-flex rounded-full bg-background border border-border p-0.5">
              <button
                onClick={() => setDevice("desktop")}
                className={cn(
                  "px-3 py-1 rounded-full text-[11px] inline-flex items-center gap-1.5 transition-colors",
                  device === "desktop" ? "bg-secondary text-foreground" : "text-muted-foreground"
                )}
              >
                <Monitor className="w-3 h-3" /> Desktop
              </button>
              <button
                onClick={() => setDevice("mobile")}
                className={cn(
                  "px-3 py-1 rounded-full text-[11px] inline-flex items-center gap-1.5 transition-colors",
                  device === "mobile" ? "bg-secondary text-foreground" : "text-muted-foreground"
                )}
              >
                <Smartphone className="w-3 h-3" /> Mobile
              </button>
            </div>
            <div className="flex-1" />
            <button
              className="btn-ghost"
              disabled={!hasMock || isGenerating}
              onClick={handleGenerate}
            >
              <RefreshCw className="w-3 h-3" /> Regenerate
            </button>
            <button
              onClick={() => setShowFinalize(true)}
              disabled={!hasMock}
              className="btn-green"
              style={{ paddingLeft: 14, paddingRight: 14 }}
            >
              <Send className="w-3 h-3" /> Finalize and Send
            </button>
          </div>

          <div
            className="surface-card !p-0 overflow-hidden flex items-center justify-center"
            style={{ minHeight: "60vh" }}
          >
            {isGenerating ? (
              <div className="flex flex-col items-center gap-4 py-16 px-6 w-full max-w-md">
                <div className="text-[12px] text-muted-foreground">
                  Building your mock website — this usually takes about 30 seconds
                </div>
                <div className="w-full h-1.5 rounded-full bg-secondary overflow-hidden">
                  <div
                    className="h-full bg-primary-hover rounded-full"
                    style={{
                      width: "40%",
                      animation: "mock-progress 2.4s ease-in-out infinite",
                    }}
                  />
                </div>
                <style>{`@keyframes mock-progress { 0%{margin-left:-30%;width:30%} 50%{margin-left:35%;width:40%} 100%{margin-left:100%;width:30%} }`}</style>
              </div>
            ) : mock?.preview_url ? (
              <div
                className={cn(
                  "w-full h-full",
                  device === "mobile" ? "flex items-start justify-center py-6" : ""
                )}
              >
                <iframe
                  src={mock.preview_url}
                  title="Mock preview"
                  className={cn(
                    "bg-white",
                    device === "mobile"
                      ? "rounded-2xl border border-border"
                      : "w-full"
                  )}
                  style={
                    device === "mobile"
                      ? { width: 390, height: "70vh" }
                      : { width: "100%", height: "70vh", border: 0 }
                  }
                />
              </div>
            ) : (
              <div
                className="flex items-center justify-center w-full text-center text-[12px] text-muted-foreground"
                style={{
                  border: "1.5px dashed hsl(var(--border-hover))",
                  borderRadius: 10,
                  margin: 12,
                  padding: "60px 20px",
                  alignSelf: "stretch",
                  minHeight: "55vh",
                }}
              >
                Your mock website will appear here
              </div>
            )}
          </div>
        </div>
      </div>

      {showFinalize && (
        <FinalizeOverlay
          lead={lead}
          mock={mock ?? null}
          countyLabel={fullCounty}
          onClose={() => setShowFinalize(false)}
        />
      )}
    </div>
  );
}

/* ---------- finalize overlay ---------- */

function FinalizeOverlay({
  lead,
  mock,
  countyLabel,
  onClose,
}: {
  lead: Lead;
  mock: MockRow | null;
  countyLabel: string;
  onClose: () => void;
}) {
  const previewUrl = mock?.preview_url ?? "";

  const defaultSubject = `Your mock website is ready, ${lead.business_name}`;
  const defaultBody = [
    `Hey,`,
    ``,
    `I just finished your free mock website. You can take a look here:`,
    previewUrl || "[mock preview link]",
    ``,
    `If it feels close to what you had in mind, give the agreement below a quick read and send it back signed and we will get everything finished and live for you.`,
    ``,
    `Any tweaks you want — copy, photos, layout — just say the word.`,
    ``,
    `Brad Hemminger`,
    countyLabel || "",
  ].join("\n");

  const defaultAgreement = [
    `SERVICE AGREEMENT`,
    ``,
    `Client: ${lead.business_name}`,
    `Service Provider: Brad Hemminger`,
    ``,
    `Scope: One fully built and deployed business website based on the approved mock.`,
    `Fee: $500 flat. No hidden costs.`,
    `Delivery: 48 hours from receipt of signed agreement.`,
    `Revisions: Unlimited revisions until the client is satisfied.`,
    `Payment: No payment is due until the client approves the finished site.`,
    ``,
    `Signed: ____________________________`,
    `Date:   ____________________________`,
  ].join("\n");

  const [subject, setSubject] = useState(defaultSubject);
  const [emailBody, setEmailBody] = useState(defaultBody);
  const [agreement, setAgreement] = useState(defaultAgreement);
  const [submitting, setSubmitting] = useState(false);

  const qc = useQueryClient();
  const handleConfirm = async () => {
    if (!previewUrl) {
      toast.error("Generate the mock first");
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-mock-delivery", {
        body: {
          lead_id: lead.id,
          subject,
          email_body: emailBody,
          agreement,
        },
      });
      if (error || (data && (data as any).error)) {
        const msg = (error as any)?.message ?? (data as any)?.error ?? "Send failed";
        throw new Error(String(msg));
      }
      toast.success("Mock + agreement sent");
      qc.invalidateQueries();
      onClose();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to send");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-start justify-center overflow-y-auto p-4 md:p-8">
      <div className="bg-surface border border-border rounded-xl w-full max-w-3xl">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div className="text-[14px] font-semibold">Finalize and send — {lead.business_name}</div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-md inline-flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-6">
          {/* Section 1 — Email */}
          <section>
            <div className="label-uppercase mb-2">1 · Email to client</div>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="input-base w-full mb-2"
              placeholder="Subject"
            />
            <textarea
              value={emailBody}
              onChange={(e) => setEmailBody(e.target.value)}
              rows={10}
              className="input-base w-full font-mono"
              style={{ resize: "vertical" }}
            />
          </section>

          {/* Section 2 — Mock link */}
          <section>
            <div className="label-uppercase mb-2">2 · Mock preview link</div>
            <div className="flex items-center gap-2">
              <div className="input-base flex-1 truncate text-muted-foreground">
                {previewUrl || "(link will be available after generation)"}
              </div>
              <a
                href={previewUrl || "#"}
                target="_blank"
                rel="noreferrer"
                className={cn("btn-ghost", !previewUrl && "pointer-events-none opacity-50")}
              >
                <ExternalLink className="w-3 h-3" /> Open
              </a>
            </div>
          </section>

          {/* Section 3 — Agreement */}
          <section>
            <div className="label-uppercase mb-2">3 · Service agreement</div>
            <textarea
              value={agreement}
              onChange={(e) => setAgreement(e.target.value)}
              rows={14}
              className="input-base w-full font-mono"
              style={{ resize: "vertical" }}
            />
            <div className="text-[10px] text-muted-foreground mt-1.5">
              This will be attached as a PDF to the outgoing email.
            </div>
          </section>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border">
          <button onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={submitting}
            className="btn-green"
            style={{ paddingLeft: 16, paddingRight: 16, fontSize: 12, fontWeight: 600 }}
          >
            {submitting ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" /> Working…
              </>
            ) : (
              <>
                <Send className="w-3 h-3" /> Confirm and Send
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
