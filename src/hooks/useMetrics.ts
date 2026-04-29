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
        emailsSentTodayMidnightRes,
        leadsFoundTodayRes,
        repliesReceivedTodayRes,
        dealsThisMonthRes,
        paidThisMonthRes,
        repliesAllRes,
        emailsAllRes,
        followupsDueTodayRes,
        dealsClosedThisMonthRes,
        dealsInProgressRes,
        emailsAllTimeRes,
        unactionedRepliesRes,
        settingsRes,
      ] = await Promise.all([
        supabase.from("leads").select("id", { count: "exact", head: true })
          .eq("status", "new").eq("outreach_count", 0).eq("archived", false),
        supabase.from("leads").select("id", { count: "exact", head: true })
          .gte("last_contacted", startOfWeek.toISOString()),
        supabase.from("replies").select("id", { count: "exact", head: true })
          .in("intent", ["interested", "price_inquiry", "mock_request", "call_request"])
          .eq("actioned", false),
        // Emails sent in last 24h (top bar "emails today")
        supabase.from("outreach_emails").select("id", { count: "exact", head: true })
          .gte("sent_at", last24h.toISOString()),
        // Emails since midnight (dashboard "emails sent today")
        supabase.from("outreach_emails").select("id", { count: "exact", head: true })
          .gte("sent_at", startOfDay.toISOString()),
        // Leads found today
        supabase.from("leads").select("id", { count: "exact", head: true })
          .gte("created_at", startOfDay.toISOString()),
        // Replies received today
        supabase.from("replies").select("id", { count: "exact", head: true })
          .gte("received_at", startOfDay.toISOString()),
        supabase.from("deals").select("id", { count: "exact", head: true })
          .gte("created_at", startOfMonth.toISOString()),
        supabase.from("deals").select("actual_value, estimated_value, stage, stage_entered_at")
          .gte("stage_entered_at", startOfMonth.toISOString()).eq("stage", "paid"),
        // All replies count for reply rate
        supabase.from("replies").select("id", { count: "exact", head: true }),
        // All emails count for reply rate
        supabase.from("outreach_emails").select("id", { count: "exact", head: true }),
        supabase.from("followup_queue").select("id", { count: "exact", head: true })
          .eq("sent", false).lte("due_date", new Date().toISOString().slice(0, 10)),
        supabase.from("deals").select("id", { count: "exact", head: true })
          .gte("stage_entered_at", startOfMonth.toISOString())
          .in("stage", ["won", "building", "delivered", "paid"]),
        // Deals in progress: not paid, not archived
        supabase.from("deals").select("id", { count: "exact", head: true })
          .not("stage", "in", "(paid,archived)"),
        // Emails sent all time
        supabase.from("outreach_emails").select("id", { count: "exact", head: true }),
        // Unactioned replies (action needed count)
        supabase.from("replies").select("id", { count: "exact", head: true }).eq("actioned", false),
        supabase.from("settings").select("outreach_active").eq("id", 1).maybeSingle(),
      ]);

      const revenueMtdCents = (paidThisMonthRes.data || [])
        .reduce((s, d: any) => s + (d.actual_value ?? d.estimated_value ?? 0), 0);

      const repliesAll = repliesAllRes.count ?? 0;
      const emailsAll = emailsAllRes.count ?? 0;
      const replyRatePct = emailsAll > 0 ? Math.round((repliesAll / emailsAll) * 1000) / 10 : 0;

      return {
        leadsInQueue: leadsInQueueRes.count ?? 0,
        contactedThisWeek: contactedThisWeekRes.count ?? 0,
        interested: interestedRes.count ?? 0,
        emailsSentToday: emailsSentTodayRes.count ?? 0,
        emailsSentTodayMidnight: emailsSentTodayMidnightRes.count ?? 0,
        leadsFoundToday: leadsFoundTodayRes.count ?? 0,
        repliesReceivedToday: repliesReceivedTodayRes.count ?? 0,
        dealsThisMonth: dealsThisMonthRes.count ?? 0,
        revenueMtdCents,
        replyRateThisWeek: replyRatePct,
        replyRatePct,
        followupsDueToday: followupsDueTodayRes.count ?? 0,
        dealsClosedThisMonth: dealsClosedThisMonthRes.count ?? 0,
        dealsInProgress: dealsInProgressRes.count ?? 0,
        emailsAllTime: emailsAllTimeRes.count ?? 0,
        unactionedReplies: unactionedRepliesRes.count ?? 0,
        outreachActive: !!settingsRes.data?.outreach_active,
      };
    },
    refetchInterval: 60000,
  });
}

export function useTabBadges() {
  return useQuery({
    queryKey: ["tab-badges"],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const [leads, calls, mocks, replies, followups] = await Promise.all([
        supabase.from("leads").select("id", { count: "exact", head: true })
          .eq("status", "new").eq("outreach_count", 0).eq("archived", false),
        supabase.from("replies").select("id", { count: "exact", head: true })
          .eq("intent", "call_request").eq("actioned", false),
        supabase.from("mock_sites").select("id", { count: "exact", head: true })
          .in("status", ["pending", "generating", "ready"]),
        supabase.from("replies").select("id", { count: "exact", head: true })
          .eq("actioned", false),
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
