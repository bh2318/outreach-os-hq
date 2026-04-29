export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity_log: {
        Row: {
          action_type: string
          business_name: string | null
          created_at: string
          detail: string | null
          id: string
          lead_id: string | null
          outcome: string
        }
        Insert: {
          action_type: string
          business_name?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          lead_id?: string | null
          outcome?: string
        }
        Update: {
          action_type?: string
          business_name?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          lead_id?: string | null
          outcome?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      deals: {
        Row: {
          actual_value: number | null
          created_at: string
          estimated_value: number | null
          id: string
          lead_id: string | null
          notes: string | null
          stage: string
          stage_entered_at: string
        }
        Insert: {
          actual_value?: number | null
          created_at?: string
          estimated_value?: number | null
          id?: string
          lead_id?: string | null
          notes?: string | null
          stage?: string
          stage_entered_at?: string
        }
        Update: {
          actual_value?: number | null
          created_at?: string
          estimated_value?: number | null
          id?: string
          lead_id?: string | null
          notes?: string | null
          stage?: string
          stage_entered_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deals_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      incoming_replies: {
        Row: {
          classified_as: string | null
          id: string
          lead_id: string | null
          processed: boolean
          received_at: string
          reply_text: string
        }
        Insert: {
          classified_as?: string | null
          id?: string
          lead_id?: string | null
          processed?: boolean
          received_at?: string
          reply_text: string
        }
        Update: {
          classified_as?: string | null
          id?: string
          lead_id?: string | null
          processed?: boolean
          received_at?: string
          reply_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "incoming_replies_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          deal_id: string | null
          due_at: string | null
          id: string
          invoice_number: string | null
          issued_at: string
          lead_id: string | null
          line_items: Json | null
          paid_at: string | null
          sent_at: string | null
          status: string
          total_cents: number | null
        }
        Insert: {
          deal_id?: string | null
          due_at?: string | null
          id?: string
          invoice_number?: string | null
          issued_at?: string
          lead_id?: string | null
          line_items?: Json | null
          paid_at?: string | null
          sent_at?: string | null
          status?: string
          total_cents?: number | null
        }
        Update: {
          deal_id?: string | null
          due_at?: string | null
          id?: string
          invoice_number?: string | null
          issued_at?: string
          lead_id?: string | null
          line_items?: Json | null
          paid_at?: string | null
          sent_at?: string | null
          status?: string
          total_cents?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          address: string | null
          archived: boolean
          business_name: string
          city: string | null
          county: string | null
          created_at: string
          email: string | null
          id: string
          last_contacted: string | null
          niche: string | null
          notes: string | null
          outreach_count: number
          owner_name: string | null
          phone: string | null
          place_id: string | null
          rating: number | null
          review_count: number | null
          site_audit_json: Json | null
          site_score: number | null
          state: string | null
          status: string
          website_url: string | null
          zip: string | null
        }
        Insert: {
          address?: string | null
          archived?: boolean
          business_name: string
          city?: string | null
          county?: string | null
          created_at?: string
          email?: string | null
          id?: string
          last_contacted?: string | null
          niche?: string | null
          notes?: string | null
          outreach_count?: number
          owner_name?: string | null
          phone?: string | null
          place_id?: string | null
          rating?: number | null
          review_count?: number | null
          site_audit_json?: Json | null
          site_score?: number | null
          state?: string | null
          status?: string
          website_url?: string | null
          zip?: string | null
        }
        Update: {
          address?: string | null
          archived?: boolean
          business_name?: string
          city?: string | null
          county?: string | null
          created_at?: string
          email?: string | null
          id?: string
          last_contacted?: string | null
          niche?: string | null
          notes?: string | null
          outreach_count?: number
          owner_name?: string | null
          phone?: string | null
          place_id?: string | null
          rating?: number | null
          review_count?: number | null
          site_audit_json?: Json | null
          site_score?: number | null
          state?: string | null
          status?: string
          website_url?: string | null
          zip?: string | null
        }
        Relationships: []
      }
      mock_sites: {
        Row: {
          expires_at: string | null
          generated_at: string | null
          id: string
          lead_id: string | null
          opened_count: number
          preview_url: string | null
          requested_at: string
          sent_at: string | null
          status: string
        }
        Insert: {
          expires_at?: string | null
          generated_at?: string | null
          id?: string
          lead_id?: string | null
          opened_count?: number
          preview_url?: string | null
          requested_at?: string
          sent_at?: string | null
          status?: string
        }
        Update: {
          expires_at?: string | null
          generated_at?: string | null
          id?: string
          lead_id?: string | null
          opened_count?: number
          preview_url?: string | null
          requested_at?: string
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "mock_sites_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          acted_at: string | null
          acted_on: boolean
          business_name: string
          created_at: string
          id: string
          kind: string
          lead_id: string | null
          mock_site_id: string | null
          read: boolean
          reply_body: string | null
          reply_full: string | null
          reply_preview: string | null
          status: string
          type: string
        }
        Insert: {
          acted_at?: string | null
          acted_on?: boolean
          business_name: string
          created_at?: string
          id?: string
          kind?: string
          lead_id?: string | null
          mock_site_id?: string | null
          read?: boolean
          reply_body?: string | null
          reply_full?: string | null
          reply_preview?: string | null
          status?: string
          type?: string
        }
        Update: {
          acted_at?: string | null
          acted_on?: boolean
          business_name?: string
          created_at?: string
          id?: string
          kind?: string
          lead_id?: string | null
          mock_site_id?: string | null
          read?: boolean
          reply_body?: string | null
          reply_full?: string | null
          reply_preview?: string | null
          status?: string
          type?: string
        }
        Relationships: []
      }
      outreach_emails: {
        Row: {
          body: string | null
          id: string
          lead_id: string | null
          opened_at: string | null
          sent_at: string | null
          sequence_number: number | null
          status: string | null
          subject: string | null
        }
        Insert: {
          body?: string | null
          id?: string
          lead_id?: string | null
          opened_at?: string | null
          sent_at?: string | null
          sequence_number?: number | null
          status?: string | null
          subject?: string | null
        }
        Update: {
          body?: string | null
          id?: string
          lead_id?: string | null
          opened_at?: string | null
          sent_at?: string | null
          sequence_number?: number | null
          status?: string | null
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "outreach_emails_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      replies: {
        Row: {
          actioned: boolean
          body: string | null
          classified_at: string | null
          confidence: number | null
          email_id: string | null
          from_email: string | null
          id: string
          intent: string | null
          lead_id: string | null
          received_at: string
          subject: string | null
        }
        Insert: {
          actioned?: boolean
          body?: string | null
          classified_at?: string | null
          confidence?: number | null
          email_id?: string | null
          from_email?: string | null
          id?: string
          intent?: string | null
          lead_id?: string | null
          received_at?: string
          subject?: string | null
        }
        Update: {
          actioned?: boolean
          body?: string | null
          classified_at?: string | null
          confidence?: number | null
          email_id?: string | null
          from_email?: string | null
          id?: string
          intent?: string | null
          lead_id?: string | null
          received_at?: string
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "replies_email_id_fkey"
            columns: ["email_id"]
            isOneToOne: false
            referencedRelation: "outreach_emails"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "replies_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          auto_followup: boolean
          calendly_connected: boolean
          claude_api_key: string | null
          daily_send_limit: number
          default_lead_volume: number
          excluded_niches: string[]
          followup_days: number[]
          google_places_key: string | null
          id: number
          invoice_address: string | null
          invoice_business_name: string | null
          min_site_score: number
          operator_city: string | null
          operator_name: string | null
          payment_instructions: string | null
          payment_terms_days: number
          reply_to_email: string | null
          require_approval: boolean
          send_window_end: string
          send_window_start: string
          stripe_connected: boolean
        }
        Insert: {
          auto_followup?: boolean
          calendly_connected?: boolean
          claude_api_key?: string | null
          daily_send_limit?: number
          default_lead_volume?: number
          excluded_niches?: string[]
          followup_days?: number[]
          google_places_key?: string | null
          id?: number
          invoice_address?: string | null
          invoice_business_name?: string | null
          min_site_score?: number
          operator_city?: string | null
          operator_name?: string | null
          payment_instructions?: string | null
          payment_terms_days?: number
          reply_to_email?: string | null
          require_approval?: boolean
          send_window_end?: string
          send_window_start?: string
          stripe_connected?: boolean
        }
        Update: {
          auto_followup?: boolean
          calendly_connected?: boolean
          claude_api_key?: string | null
          daily_send_limit?: number
          default_lead_volume?: number
          excluded_niches?: string[]
          followup_days?: number[]
          google_places_key?: string | null
          id?: number
          invoice_address?: string | null
          invoice_business_name?: string | null
          min_site_score?: number
          operator_city?: string | null
          operator_name?: string | null
          payment_instructions?: string | null
          payment_terms_days?: number
          reply_to_email?: string | null
          require_approval?: boolean
          send_window_end?: string
          send_window_start?: string
          stripe_connected?: boolean
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
