import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useDashboardMetrics() {
  return useQuery({
    queryKey: ["metrics"],
    queryFn: async () => {
      const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
      const startOfWeek = new Date(); startOfWeek.setDate(startOfWeek.getDate() - 7);
      const startOfMonth = new Date(); startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0);
      const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const [
        leadsInQueueRes,
        contactedThisWeekRes,
        interestedRes,
        emailsSentTodayRes,
        dealsThisMonthRes,
        paidThisMonthRes,
        repliesThisWeekRes,
        emailsThisWeekRes,
        followupsDueTodayRes,
        dealsClosedThisMonthRes,
      ] = await Promise.all([
        // Leads in queue: status=new, outreach_count=0, not archived
        supabase.from("leads").select("id", { count: "exact", head: true })
          .eq("status", "new").eq("outreach_count", 0).eq("archived", false),
        // Contacted this week: leads whose last_contacted within 7d
        supabase.from("leads").select("id", { count: "exact", head: true })
          .gte("last_contacted", startOfWeek.toISOString()),
        // Interested: replies marked interested and not actioned
        supabase.from("replies").select("id", { count: "exact", head: true })
          .in("intent", ["interested", "price_inquiry", "mock_request", "call_request"])
          .eq("actioned", false),
        // Emails sent today (last 24h via outreach_emails)
        supabase.from("outreach_emails").select("id", { count: "exact", head: true })
          .gte("sent_at", last24h.toISOString()),
        // Deals this month (created)
        supabase.from("deals").select("id", { count: "exact", head: true })
          .gte("created_at", startOfMonth.toISOString()),
        // Revenue MTD: paid deals this month
        supabase.from("deals").select("actual_value, estimated_value, stage, stage_entered_at")
          .gte("stage_entered_at", startOfMonth.toISOString()).eq("stage", "paid"),
        // Replies this week
        supabase.from("replies").select("id", { count: "exact", head: true })
          .gte("received_at", startOfWeek.toISOString()),
        // Emails sent this week
        supabase.from("outreach_emails").select("id", { count: "exact", head: true })
          .gte("sent_at", startOfWeek.toISOString()),
        // Follow-ups due today
        supabase.from("followup_queue").select("id", { count: "exact", head: true })
          .eq("sent", false).lte("due_date", new Date().toISOString().slice(0, 10)),
        // Deals closed this month (won/delivered/paid via stage_entered_at)
        supabase.from("deals").select("id", { count: "exact", head: true })
          .gte("stage_entered_at", startOfMonth.toISOString())
          .in("stage", ["won", "building", "delivered", "paid"]),
      ]);

      const revenueMtdCents = (paidThisMonthRes.data || [])
        .reduce((s, d: any) => s + (d.actual_value ?? d.estimated_value ?? 0), 0);

      const repliesWk = repliesThisWeekRes.count ?? 0;
      const emailsWk = emailsThisWeekRes.count ?? 0;
      const replyRateThisWeek = emailsWk > 0 ? Math.round((repliesWk / emailsWk) * 100) : 0;

      return {
        leadsInQueue: leadsInQueueRes.count ?? 0,
        contactedThisWeek: contactedThisWeekRes.count ?? 0,
        interested: interestedRes.count ?? 0,
        emailsSentToday: emailsSentTodayRes.count ?? 0,
        dealsThisMonth: dealsThisMonthRes.count ?? 0,
        revenueMtdCents,
        replyRateThisWeek,
        followupsDueToday: followupsDueTodayRes.count ?? 0,
        dealsClosedThisMonth: dealsClosedThisMonthRes.count ?? 0,
      };
    },
    refetchInterval: 15000,
  });
}

export function useTabBadges() {
  return useQuery({
    queryKey: ["tab-badges"],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const [leads, calls, mocks, replies, followups] = await Promise.all([
        // Leads: uncontacted leads count (status=new, outreach_count=0, not archived)
        supabase.from("leads").select("id", { count: "exact", head: true })
          .eq("status", "new").eq("outreach_count", 0).eq("archived", false),
        supabase.from("replies").select("id", { count: "exact", head: true })
          .eq("intent", "call_request").eq("actioned", false),
        supabase.from("mock_sites").select("id", { count: "exact", head: true })
          .in("status", ["pending", "generating", "ready"]),
        supabase.from("replies").select("id", { count: "exact", head: true })
          .eq("actioned", false),
        // Follow-ups due today (from queue)
        supabase.from("followup_queue").select("id", { count: "exact", head: true })
          .eq("sent", false).lte("due_date", today),
      ]);
      return {
        leads: leads.count ?? 0,
        calls: calls.count ?? 0,
        mocks: mocks.count ?? 0,
        replies: replies.count ?? 0,
        followups: followups.count ?? 0,
      };
    },
    refetchInterval: 10000,
  });
}
