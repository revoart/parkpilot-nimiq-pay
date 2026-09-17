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
      app_events: {
        Row: {
          anonymous_device_id: string | null
          created_at: string
          event_name: string
          nimiq_address: string | null
          id: string
          metadata: Json | null
        }
        Insert: {
          anonymous_device_id?: string | null
          created_at?: string
          event_name: string
          nimiq_address?: string | null
          id?: string
          metadata?: Json | null
        }
        Update: {
          anonymous_device_id?: string | null
          created_at?: string
          event_name?: string
          nimiq_address?: string | null
          id?: string
          metadata?: Json | null
        }
        Relationships: []
      }
      auth_challenges: {
        Row: {
          created_at: string
          nimiq_address: string
          expires_at: string
          id: string
          nonce: string
          used: boolean
        }
        Insert: {
          created_at?: string
          nimiq_address: string
          expires_at: string
          id?: string
          nonce: string
          used?: boolean
        }
        Update: {
          created_at?: string
          nimiq_address?: string
          expires_at?: string
          id?: string
          nonce?: string
          used?: boolean
        }
        Relationships: []
      }
      ledger_accounts: {
        Row: {
          created_at: string
          currency: string
          id: string
          owner_address: string
          owner_type: string
        }
        Insert: {
          created_at?: string
          currency?: string
          id?: string
          owner_address: string
          owner_type: string
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          owner_address?: string
          owner_type?: string
        }
        Relationships: []
      }
      ledger_entries: {
        Row: {
          account_id: string
          amount_raw: number
          amount_nim: number
          created_at: string
          direction: string
          entry_type: string
          id: string
          payment_id: string | null
          payout_id: string | null
          reservation_id: string | null
        }
        Insert: {
          account_id: string
          amount_raw: number
          amount_nim: number
          created_at?: string
          direction: string
          entry_type: string
          id?: string
          payment_id?: string | null
          payout_id?: string | null
          reservation_id?: string | null
        }
        Update: {
          account_id?: string
          amount_raw?: number
          amount_nim?: number
          created_at?: string
          direction?: string
          entry_type?: string
          id?: string
          payment_id?: string | null
          payout_id?: string | null
          reservation_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "ledger_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "payouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      parking_availability: {
        Row: {
          available: boolean
          created_at: string
          date: string
          end_time: string
          id: string
          parking_space_id: string
          start_time: string
        }
        Insert: {
          available?: boolean
          created_at?: string
          date: string
          end_time: string
          id?: string
          parking_space_id: string
          start_time: string
        }
        Update: {
          available?: boolean
          created_at?: string
          date?: string
          end_time?: string
          id?: string
          parking_space_id?: string
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "parking_availability_parking_space_id_fkey"
            columns: ["parking_space_id"]
            isOneToOne: false
            referencedRelation: "parking_spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      parking_availability_rules: {
        Row: {
          active: boolean
          created_at: string
          end_time: string
          id: string
          parking_space_id: string
          start_time: string
          weekday: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          end_time: string
          id?: string
          parking_space_id: string
          start_time: string
          weekday: number
        }
        Update: {
          active?: boolean
          created_at?: string
          end_time?: string
          id?: string
          parking_space_id?: string
          start_time?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "parking_availability_rules_parking_space_id_fkey"
            columns: ["parking_space_id"]
            isOneToOne: false
            referencedRelation: "parking_spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      parking_space_photos: {
        Row: {
          id: string
          parking_space_id: string
          sort_order: number
          storage_path: string
        }
        Insert: {
          id?: string
          parking_space_id: string
          sort_order?: number
          storage_path: string
        }
        Update: {
          id?: string
          parking_space_id?: string
          sort_order?: number
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "parking_space_photos_parking_space_id_fkey"
            columns: ["parking_space_id"]
            isOneToOne: false
            referencedRelation: "parking_spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      parking_spaces: {
        Row: {
          accessible: boolean
          active: boolean
          address: string
          covered: boolean
          created_at: string
          description: string | null
          ev_charging: boolean
          id: string
          image_url: string | null
          latitude: number
          longitude: number
          owner_nimiq_address: string | null
          parking_type: string | null
          price_nim: number
          title: string
          updated_at: string
        }
        Insert: {
          accessible?: boolean
          active?: boolean
          address: string
          covered?: boolean
          created_at?: string
          description?: string | null
          ev_charging?: boolean
          id?: string
          image_url?: string | null
          latitude: number
          longitude: number
          owner_nimiq_address?: string | null
          parking_type?: string | null
          price_nim: number
          title: string
          updated_at?: string
        }
        Update: {
          accessible?: boolean
          active?: boolean
          address?: string
          covered?: boolean
          created_at?: string
          description?: string | null
          ev_charging?: boolean
          id?: string
          image_url?: string | null
          latitude?: number
          longitude?: number
          owner_nimiq_address?: string | null
          parking_type?: string | null
          price_nim?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      payment_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          payload: Json | null
          payment_id: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          payload?: Json | null
          payment_id?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json | null
          payment_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_events_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_raw: number
          amount_nim: number
          block_number: number | null
          chain: string
          confirmed_at: string | null
          created_at: string
          id: string
          recipient_address: string
          reservation_id: string
          sender_address: string
          status: Database["public"]["Enums"]["payment_status"]
          submitted_at: string | null
          token: string
          token_contract: string | null
          tx_hash: string
        }
        Insert: {
          amount_raw: number
          amount_nim: number
          block_number?: number | null
          chain?: string
          confirmed_at?: string | null
          created_at?: string
          id?: string
          recipient_address: string
          reservation_id: string
          sender_address: string
          status?: Database["public"]["Enums"]["payment_status"]
          submitted_at?: string | null
          token?: string
          token_contract: string | null
          tx_hash: string
        }
        Update: {
          amount_raw?: number
          amount_nim?: number
          block_number?: number | null
          chain?: string
          confirmed_at?: string | null
          created_at?: string
          id?: string
          recipient_address?: string
          reservation_id?: string
          sender_address?: string
          status?: Database["public"]["Enums"]["payment_status"]
          submitted_at?: string | null
          token?: string
          token_contract?: string | null | undefined
          tx_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      payouts: {
        Row: {
          amount_nim: number
          block_number: number | null
          completed_at: string | null
          host_address: string
          id: string
          requested_at: string
          status: string
          tx_hash: string | null
        }
        Insert: {
          amount_nim: number
          block_number?: number | null
          completed_at?: string | null
          host_address: string
          id?: string
          requested_at?: string
          status?: string
          tx_hash?: string | null
        }
        Update: {
          amount_nim?: number
          block_number?: number | null
          completed_at?: string | null
          host_address?: string
          id?: string
          requested_at?: string
          status?: string
          tx_hash?: string | null
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          nimiq_address: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          nimiq_address?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          nimiq_address?: string | null
        }
        Relationships: []
      }
      reservations: {
        Row: {
          amount_nim: number
          created_at: string
          destination_address: string | null
          destination_lat: number | null
          destination_lng: number | null
          destination_name: string | null
          end_at: string
          expires_at: string | null
          fee_amount_nim: number | null
          host_amount_nim: number | null
          id: string
          nimiq_address: string
          parking_space_id: string
          recipient_address: string | null
          start_at: string
          status: Database["public"]["Enums"]["reservation_status"]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          amount_nim: number
          created_at?: string
          destination_address?: string | null
          destination_lat?: number | null
          destination_lng?: number | null
          destination_name?: string | null
          end_at: string
          expires_at?: string | null
          fee_amount_nim?: number | null
          host_amount_nim?: number | null
          id?: string
          nimiq_address: string
          parking_space_id: string
          recipient_address?: string | null
          start_at: string
          status?: Database["public"]["Enums"]["reservation_status"]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          amount_nim?: number
          created_at?: string
          destination_address?: string | null
          destination_lat?: number | null
          destination_lng?: number | null
          destination_name?: string | null
          end_at?: string
          expires_at?: string | null
          fee_amount_nim?: number | null
          host_amount_nim?: number | null
          id?: string
          nimiq_address?: string
          parking_space_id?: string
          recipient_address?: string | null
          start_at?: string
          status?: Database["public"]["Enums"]["reservation_status"]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reservations_parking_space_id_fkey"
            columns: ["parking_space_id"]
            isOneToOne: false
            referencedRelation: "parking_spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          comment: string | null
          created_at: string
          nimiq_address: string | null
          id: string
          parking_space_id: string
          rating: number
          reviewer_name: string | null
        }
        Insert: {
          comment?: string | null
          created_at?: string
          nimiq_address?: string | null
          id?: string
          parking_space_id: string
          rating: number
          reviewer_name?: string | null
        }
        Update: {
          comment?: string | null
          created_at?: string
          nimiq_address?: string | null
          id?: string
          parking_space_id?: string
          rating?: number
          reviewer_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reviews_parking_space_id_fkey"
            columns: ["parking_space_id"]
            isOneToOne: false
            referencedRelation: "parking_spaces"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      expire_auth_challenges: { Args: never; Returns: number }
      expire_stale_reservations: { Args: never; Returns: number }
      nearby_parking_spaces: {
        Args: {
          p_lat: number
          p_lng: number
          p_radius_m?: number
          p_limit?: number
        }
        Returns: {
          id: string
          title: string
          description: string | null
          address: string
          latitude: number
          longitude: number
          price_nim: number
          parking_type: string | null
          covered: boolean
          ev_charging: boolean
          accessible: boolean
          active: boolean
          created_at: string
          updated_at: string
          owner_nimiq_address: string | null
          image_url: string | null
          distance_m: number
          busy_until: string | null
          rating_avg: number | null
          rating_count: number
        }[]
      }
      request_payout: {
        Args: { p_amount: number; p_host: string }
        Returns: {
          amount_nim: number
          id: string
          requested_at: string
          status: string
        }[]
      }
    }
    Enums: {
      payment_status:
        | "payment_pending"
        | "payment_submitted"
        | "payment_verifying"
        | "payment_confirmed"
        | "payment_failed"
        | "payment_expired"
      reservation_status:
        | "reservation_pending"
        | "reservation_confirmed"
        | "reservation_cancelled"
        | "reservation_completed"
        | "reservation_expired"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      payment_status: [
        "payment_pending",
        "payment_submitted",
        "payment_verifying",
        "payment_confirmed",
        "payment_failed",
        "payment_expired",
      ],
      reservation_status: [
        "reservation_pending",
        "reservation_confirmed",
        "reservation_cancelled",
        "reservation_completed",
        "reservation_expired",
      ],
    },
  },
} as const
