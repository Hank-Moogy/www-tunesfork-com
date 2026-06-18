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
      collaborators: {
        Row: {
          created_at: string
          id: string
          permission_level: Database["public"]["Enums"]["permission_level"]
          project_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          permission_level?: Database["public"]["Enums"]["permission_level"]
          project_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          permission_level?: Database["public"]["Enums"]["permission_level"]
          project_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "collaborators_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          body: string
          created_at: string
          id: string
          timestamp_seconds: number | null
          user_id: string
          version_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          timestamp_seconds?: number | null
          user_id: string
          version_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          timestamp_seconds?: number | null
          user_id?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "project_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      device_pair_codes: {
        Row: {
          code: string
          confirmed_at: string | null
          created_at: string
          device_name: string
          expires_at: string
          id: string
          token_id: string | null
          user_id: string | null
        }
        Insert: {
          code: string
          confirmed_at?: string | null
          created_at?: string
          device_name?: string
          expires_at?: string
          id?: string
          token_id?: string | null
          user_id?: string | null
        }
        Update: {
          code?: string
          confirmed_at?: string | null
          created_at?: string
          device_name?: string
          expires_at?: string
          id?: string
          token_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "device_pair_codes_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "device_tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      device_tokens: {
        Row: {
          created_at: string
          id: string
          last_used_at: string | null
          name: string
          revoked_at: string | null
          token_hash: string
          token_prefix: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_used_at?: string | null
          name?: string
          revoked_at?: string | null
          token_hash: string
          token_prefix: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_used_at?: string | null
          name?: string
          revoked_at?: string | null
          token_hash?: string
          token_prefix?: string
          user_id?: string
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          message: string | null
          read: boolean
          reference_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message?: string | null
          read?: boolean
          reference_id?: string | null
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string | null
          read?: boolean
          reference_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      onboarding_responses: {
        Row: {
          completed_at: string
          id: string
          music_genres: Json | null
          producer_level: string | null
          referral_source: string | null
          usage_mode: string | null
          user_id: string
        }
        Insert: {
          completed_at?: string
          id?: string
          music_genres?: Json | null
          producer_level?: string | null
          referral_source?: string | null
          usage_mode?: string | null
          user_id: string
        }
        Update: {
          completed_at?: string
          id?: string
          music_genres?: Json | null
          producer_level?: string | null
          referral_source?: string | null
          usage_mode?: string | null
          user_id?: string
        }
        Relationships: []
      }
      plugin_catalog: {
        Row: {
          aliases: Json
          created_at: string
          developer: string
          id: string
          is_free: boolean
          logo_url: string | null
          name: string
          normalized_name: string
          status: string
          submitted_by: string | null
          type: string
          updated_at: string
          website_url: string
        }
        Insert: {
          aliases?: Json
          created_at?: string
          developer?: string
          id?: string
          is_free?: boolean
          logo_url?: string | null
          name: string
          normalized_name?: string
          status?: string
          submitted_by?: string | null
          type?: string
          updated_at?: string
          website_url?: string
        }
        Update: {
          aliases?: Json
          created_at?: string
          developer?: string
          id?: string
          is_free?: boolean
          logo_url?: string | null
          name?: string
          normalized_name?: string
          status?: string
          submitted_by?: string | null
          type?: string
          updated_at?: string
          website_url?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          onboarding_completed: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          onboarding_completed?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          onboarding_completed?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      project_versions: {
        Row: {
          ableton_version: string | null
          audio_preview_url: string | null
          change_note: string | null
          created_at: string
          file_size_bytes: number
          id: string
          is_main_version: boolean
          major_version: number
          plugin_list: Json | null
          project_id: string
          sample_check: Json | null
          track_list: Json | null
          uploader_id: string
          version_number: number
          zip_url: string
        }
        Insert: {
          ableton_version?: string | null
          audio_preview_url?: string | null
          change_note?: string | null
          created_at?: string
          file_size_bytes?: number
          id?: string
          is_main_version?: boolean
          major_version?: number
          plugin_list?: Json | null
          project_id: string
          sample_check?: Json | null
          track_list?: Json | null
          uploader_id: string
          version_number: number
          zip_url: string
        }
        Update: {
          ableton_version?: string | null
          audio_preview_url?: string | null
          change_note?: string | null
          created_at?: string
          file_size_bytes?: number
          id?: string
          is_main_version?: boolean
          major_version?: number
          plugin_list?: Json | null
          project_id?: string
          sample_check?: Json | null
          track_list?: Json | null
          uploader_id?: string
          version_number?: number
          zip_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_versions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          archived: boolean
          bpm: number | null
          created_at: string
          handoff_locked_by: string | null
          handoff_status: Database["public"]["Enums"]["handoff_status"]
          id: string
          name: string
          owner_id: string
          share_token: string | null
          updated_at: string
        }
        Insert: {
          archived?: boolean
          bpm?: number | null
          created_at?: string
          handoff_locked_by?: string | null
          handoff_status?: Database["public"]["Enums"]["handoff_status"]
          id?: string
          name: string
          owner_id: string
          share_token?: string | null
          updated_at?: string
        }
        Update: {
          archived?: boolean
          bpm?: number | null
          created_at?: string
          handoff_locked_by?: string | null
          handoff_status?: Database["public"]["Enums"]["handoff_status"]
          id?: string
          name?: string
          owner_id?: string
          share_token?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      purchases: {
        Row: {
          amount_cents: number
          created_at: string | null
          currency: string
          environment: string
          id: string
          price_id: string
          product_id: string
          status: string
          stripe_customer_id: string
          stripe_session_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string | null
          currency?: string
          environment?: string
          id?: string
          price_id: string
          product_id: string
          status?: string
          stripe_customer_id: string
          stripe_session_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string | null
          currency?: string
          environment?: string
          id?: string
          price_id?: string
          product_id?: string
          status?: string
          stripe_customer_id?: string
          stripe_session_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean | null
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          environment: string
          id: string
          price_id: string
          product_id: string
          status: string
          stripe_customer_id: string
          stripe_subscription_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          id?: string
          price_id: string
          product_id: string
          status?: string
          stripe_customer_id: string
          stripe_subscription_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          id?: string
          price_id?: string
          product_id?: string
          status?: string
          stripe_customer_id?: string
          stripe_subscription_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      sync_waitlist: {
        Row: {
          created_at: string
          email: string
          id: string
          platform: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          platform?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          platform?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_share_invite: { Args: { _token: string }; Returns: string }
      count_launch_purchases: { Args: { check_env?: string }; Returns: number }
      create_notification: {
        Args: {
          notification_message?: string
          notification_reference_id?: string
          notification_type: string
          target_user_id: string
        }
        Returns: undefined
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      ensure_project_share_token: {
        Args: { _project_id: string }
        Returns: string
      }
      find_user_by_email: {
        Args: { _email: string }
        Returns: {
          avatar_url: string
          display_name: string
          user_id: string
        }[]
      }
      get_admin_metrics: { Args: never; Returns: Json }
      get_admin_user_list: {
        Args: never
        Returns: {
          collaborator_count: number
          created_at: string
          display_name: string
          project_count: number
          user_email: string
        }[]
      }
      get_frequent_collaborators: {
        Args: { _limit?: number }
        Returns: {
          avatar_url: string
          display_name: string
          email: string
          last_added_at: string
          project_count: number
          user_id: string
        }[]
      }
      get_project_by_share_token: {
        Args: { _token: string }
        Returns: {
          archived: boolean
          bpm: number | null
          created_at: string
          handoff_locked_by: string | null
          handoff_status: Database["public"]["Enums"]["handoff_status"]
          id: string
          name: string
          owner_id: string
          share_token: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "projects"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_project_share_token: {
        Args: { _project_id: string }
        Returns: string
      }
      get_user_stats: { Args: { p_user_id?: string }; Returns: Json }
      get_versions_by_share_token: {
        Args: { _token: string }
        Returns: {
          audio_preview_url: string
          change_note: string
          created_at: string
          file_size_bytes: number
          id: string
          plugin_list: Json
          project_id: string
          track_list: Json
          version_number: number
        }[]
      }
      has_active_subscription: {
        Args: { check_env?: string; user_uuid: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_collaborator: { Args: { _project_id: string }; Returns: boolean }
      is_contributor: { Args: { _project_id: string }; Returns: boolean }
      is_project_owner: { Args: { _project_id: string }; Returns: boolean }
      match_plugins: {
        Args: { plugin_names: Json }
        Returns: {
          catalog_id: string
          catalog_name: string
          developer: string
          input_name: string
          is_free: boolean
          logo_url: string
          matched: boolean
          type: string
          website_url: string
        }[]
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      normalize_plugin_name: { Args: { raw_name: string }; Returns: string }
      promote_version_to_major: {
        Args: { _version_id: string }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      set_version_audio_preview: {
        Args: { _audio_preview_url: string; _version_id: string }
        Returns: Database["public"]["Tables"]["project_versions"]["Row"]
      }
      set_main_version: { Args: { _version_id: string }; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      handoff_status: "ready" | "in_progress"
      permission_level: "viewer" | "contributor"
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
    Enums: {
      app_role: ["admin", "moderator", "user"],
      handoff_status: ["ready", "in_progress"],
      permission_level: ["viewer", "contributor"],
    },
  },
} as const
