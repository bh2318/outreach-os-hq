import { supabase } from "@/integrations/supabase/client";

export type ActionType =
  | "scraped" | "emailed" | "replied" | "mock_generated" | "mock_sent"
  | "deal_updated" | "invoice_sent" | "invoice_paid" | "system";

export type Outcome = "success" | "failed" | "flagged" | "warning";

export async function logActivity(opts: {
  action_type: ActionType;
  business_name?: string | null;
  detail: string;
  outcome?: Outcome;
  lead_id?: string | null;
}) {
  const { error } = await supabase.from("activity_log").insert({
    action_type: opts.action_type,
    business_name: opts.business_name ?? null,
    detail: opts.detail,
    outcome: opts.outcome ?? "success",
    lead_id: opts.lead_id ?? null,
  });
  if (error) console.error("activity log error", error);
}
