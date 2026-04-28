import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activity";
import { toast } from "sonner";

export function useCallRequests() {
  return useQuery({
    queryKey: ["call-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("replies")
        .select("*, leads(*)")
        .eq("intent", "call_request")
        .order("received_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useMockRequests() {
  return useQuery({
    queryKey: ["mock-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mock_sites")
        .select("*, leads(*)")
        .order("requested_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useReplies() {
  return useQuery({
    queryKey: ["replies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("replies")
        .select("*, leads(*)")
        .order("received_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useDeals() {
  return useQuery({
    queryKey: ["deals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deals")
        .select("*, leads(*)")
        .order("stage_entered_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useActivityLog() {
  return useQuery({
    queryKey: ["activity-log"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activity_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data;
    },
    refetchInterval: 8000,
  });
}

export function useSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("settings").select("*").eq("id", 1).single();
      if (error) throw error;
      return data;
    },
  });
}

/** Generic action: update a record + log activity + invalidate */
export function useRecordAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (opts: {
      table: "replies" | "mock_sites" | "deals" | "leads";
      id: string;
      patch: Record<string, any>;
      log: { action_type: any; business_name?: string | null; detail: string; outcome?: any; lead_id?: string | null };
      toast?: string;
    }) => {
      const { error } = await supabase.from(opts.table).update(opts.patch).eq("id", opts.id);
      if (error) throw error;
      await logActivity(opts.log);
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries();
      if (vars.toast) toast.success(vars.toast);
    },
    onError: (e: any) => toast.error(e.message ?? "Action failed"),
  });
}
