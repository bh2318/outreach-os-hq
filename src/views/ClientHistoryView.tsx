import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SectionLabel } from "@/components/SectionLabel";
import { EmptyState } from "@/components/EmptyState";
import { fmtMoney } from "@/lib/format";

type ClientRecord = {
  id: string;
  lead_id: string;
  actual_value: number | null;
  stage_entered_at: string;
  notes: string | null;
  leads: {
    business_name: string;
    city: string | null;
    state: string | null;
    phone: string | null;
    email: string | null;
    niche: string | null;
    website_url: string | null;
  } | null;
};

function useClientHistory() {
  return useQuery({
    queryKey: ["client-history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deals")
        .select("id, lead_id, actual_value, stage_entered_at, notes, leads(business_name, city, state, phone, email, niche, website_url)")
        .eq("stage", "paid")
        .eq("archived", false)
        .order("stage_entered_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ClientRecord[];
    },
    refetchInterval: 60000,
  });
}

function daysSince(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

export function ClientHistoryView() {
  const { data, isLoading } = useClientHistory();
  const totalRevenue = (data ?? []).reduce((sum, d) => sum + (d.actual_value ?? 0), 0);

  return (
    <div>
      <div className="flex items-baseline justify-between mb-4">
        <SectionLabel>Client history</SectionLabel>
        {(data ?? []).length > 0 && (
          <div className="text-[11px] text-muted-foreground font-mono">
            {data?.length} client{data?.length === 1 ? "" : "s"} · {fmtMoney(totalRevenue)} total revenue
          </div>
        )}
      </div>

      {isLoading ? null : !(data ?? []).length ? (
        <EmptyState>
          No closed deals yet. When a client pays and you mark the deal as paid it will appear here as a permanent client record.
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {(data ?? []).map((record) => {
            const lead = record.leads;
            const deliveredUrl = record.notes?.match(/Delivered URL: (.+)/)?.[1] ?? null;
            return (
              <div key={record.id} className="surface-card">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="text-[15px] font-semibold text-foreground">
                      {lead?.business_name ?? "Unknown"}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {lead?.niche ?? "—"} · {lead?.city ?? "—"}{lead?.state ? `, ${lead.state}` : ""}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[18px] font-mono font-semibold text-status-green-text">
                      {fmtMoney(record.actual_value)}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      Paid {daysSince(record.stage_entered_at)}d ago
                    </div>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {lead?.phone && (
                    <div className="text-[11px]">
                      <span className="text-muted-foreground">Phone </span>
                      <a href={`tel:${lead.phone}`} className="text-foreground hover:text-primary">
                        {lead.phone}
                      </a>
                    </div>
                  )}
                  {lead?.email && (
                    <div className="text-[11px]">
                      <span className="text-muted-foreground">Email </span>
                      <a href={`mailto:${lead.email}`} className="text-foreground hover:text-primary">
                        {lead.email}
                      </a>
                    </div>
                  )}
                  {deliveredUrl && (
                    <div className="text-[11px] sm:col-span-2">
                      <span className="text-muted-foreground">Site delivered </span>
                      
                        href={deliveredUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline break-all"
                      >
                        {deliveredUrl}
                      </a>
                    </div>
                  )}
                  {lead?.website_url && !deliveredUrl && (
                    <div className="text-[11px] sm:col-span-2">
                      <span className="text-muted-foreground">Original site </span>
                      
                        href={lead.website_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-muted-foreground hover:text-foreground break-all"
                      >
                        {lead.website_url}
                      </a>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
