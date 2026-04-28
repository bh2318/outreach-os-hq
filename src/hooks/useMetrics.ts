import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useDashboardMetrics() {
  return useQuery({
    queryKey: ["metrics"],
    queryFn: async () => {
      const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
      const startOfWeek = new Date(); startOfWeek.setDate(startOfWeek.getDate() - 7);
      const startOfMonth = new Date(); startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0);
      const startOfYesterday = new Date(startOfDay); startOfYesterday.setDate(startOfYesterday.getDate() - 1);

      const [todayLeads, yesterdayLeads, interested, closedThisWeek, monthDeals, totalEmails, openedEmails] = await Promise.all([
        supabase.from("leads").select("id", { count: "exact", head: true }).gte("created_at", startOfDay.toISOString()),
        supabase.from("leads").select("id", { count: "exact", head: true }).gte("created_at", startOfYesterday.toISOString()).lt("created_at", startOfDay.toISOString()),
        supabase.from("replies").select("id", { count: "exact", head: true }).in("intent", ["call_request", "mock_request", "price_inquiry", "interested"]),
        supabase.from("deals").select("id", { count: "exact", head: true }).in("stage", ["won", "building", "delivered", "paid"]).gte("stage_entered_at", startOfWeek.toISOString()),
        supabase.from("deals").select("actual_value, estimated_value, stage").gte("stage_entered_at", startOfMonth.toISOString()).in("stage", ["won", "building", "delivered", "paid"]),
        supabase.from("outreach_emails").select("id", { count: "exact", head: true }),
        supabase.from("outreach_emails").select("id", { count: "exact", head: true }).not("opened_at", "is", null),
      ]);

      const revenueCents = (monthDeals.data || []).reduce((s, d: any) => s + (d.actual_value ?? d.estimated_value ?? 0), 0);
      const sent = totalEmails.count ?? 0;
      const opened = openedEmails.count ?? 0;
      const openRate = sent > 0 ? Math.round((opened / sent) * 100) : 0;

      return {
        leadsToday: todayLeads.count ?? 0,
        leadsYesterday: yesterdayLeads.count ?? 0,
        interested: interested.count ?? 0,
        closedThisWeek: closedThisWeek.count ?? 0,
        revenueCents,
        emailsSent: sent,
        openRate,
      };
    },
    refetchInterval: 15000,
  });
}

export function useTabBadges() {
  return useQuery({
    queryKey: ["tab-badges"],
    queryFn: async () => {
      const [calls, mocks, replies] = await Promise.all([
        supabase.from("replies").select("id", { count: "exact", head: true }).eq("intent", "call_request").eq("actioned", false),
        supabase.from("mock_sites").select("id", { count: "exact", head: true }).in("status", ["pending", "generating", "ready"]),
        supabase.from("replies").select("id", { count: "exact", head: true }).eq("actioned", false),
      ]);
      return {
        calls: calls.count ?? 0,
        mocks: mocks.count ?? 0,
        replies: replies.count ?? 0,
      };
    },
    refetchInterval: 10000,
  });
}
