export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  api: {
    Tables: {
      [_ in never]: never
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
  ilka: {
    Tables: {
      expedition_members: {
        Row: {
          ban_reason: string | null
          banned_at: string | null
          created_at: string
          expedition_id: string
          id: string
          joined_at: string
          profile_id: string
          revoke_reason: string | null
          revoked_at: string | null
          role: string
          status: string
          updated_at: string
        }
        Insert: {
          ban_reason?: string | null
          banned_at?: string | null
          created_at?: string
          expedition_id: string
          id?: string
          joined_at?: string
          profile_id: string
          revoke_reason?: string | null
          revoked_at?: string | null
          role: string
          status?: string
          updated_at?: string
        }
        Update: {
          ban_reason?: string | null
          banned_at?: string | null
          created_at?: string
          expedition_id?: string
          id?: string
          joined_at?: string
          profile_id?: string
          revoke_reason?: string | null
          revoked_at?: string | null
          role?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expedition_members_expedition_id_fkey"
            columns: ["expedition_id"]
            isOneToOne: false
            referencedRelation: "expeditions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expedition_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      expeditions: {
        Row: {
          created_at: string
          created_by_profile_id: string
          day_boundary_local_time: string
          duration_days: number
          expedition_key: string
          id: string
          name: string
          recovery_days_available: number
          runtime_release_id: string
          status: string
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by_profile_id: string
          day_boundary_local_time?: string
          duration_days?: number
          expedition_key: string
          id?: string
          name: string
          recovery_days_available?: number
          runtime_release_id: string
          status?: string
          timezone: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by_profile_id?: string
          day_boundary_local_time?: string
          duration_days?: number
          expedition_key?: string
          id?: string
          name?: string
          recovery_days_available?: number
          runtime_release_id?: string
          status?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expeditions_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expeditions_runtime_release_id_fkey"
            columns: ["runtime_release_id"]
            isOneToOne: false
            referencedRelation: "runtime_releases"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          accepted_by_profile_id: string | null
          created_at: string
          email_normalized: string
          expedition_id: string
          expires_at: string
          id: string
          invited_by_membership_id: string
          revocation_reason: string | null
          revoked_at: string | null
          revoked_by_profile_id: string | null
          role: string
          status: string
          token_hash: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by_profile_id?: string | null
          created_at?: string
          email_normalized: string
          expedition_id: string
          expires_at: string
          id?: string
          invited_by_membership_id: string
          revocation_reason?: string | null
          revoked_at?: string | null
          revoked_by_profile_id?: string | null
          role: string
          status?: string
          token_hash: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by_profile_id?: string | null
          created_at?: string
          email_normalized?: string
          expedition_id?: string
          expires_at?: string
          id?: string
          invited_by_membership_id?: string
          revocation_reason?: string | null
          revoked_at?: string | null
          revoked_by_profile_id?: string | null
          role?: string
          status?: string
          token_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_accepted_by_profile_id_fkey"
            columns: ["accepted_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_expedition_id_fkey"
            columns: ["expedition_id"]
            isOneToOne: false
            referencedRelation: "expeditions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_inviter_expedition_fk"
            columns: ["invited_by_membership_id", "expedition_id"]
            isOneToOne: false
            referencedRelation: "expedition_members"
            referencedColumns: ["id", "expedition_id"]
          },
          {
            foreignKeyName: "invitations_revoked_by_profile_id_fkey"
            columns: ["revoked_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      participants: {
        Row: {
          ban_reason: string | null
          banned_at: string | null
          created_at: string
          display_name: string
          expedition_id: string
          expedition_member_id: string
          id: string
          participant_key: string
          participant_order: number
          status: string
          updated_at: string
        }
        Insert: {
          ban_reason?: string | null
          banned_at?: string | null
          created_at?: string
          display_name: string
          expedition_id: string
          expedition_member_id: string
          id?: string
          participant_key: string
          participant_order: number
          status?: string
          updated_at?: string
        }
        Update: {
          ban_reason?: string | null
          banned_at?: string | null
          created_at?: string
          display_name?: string
          expedition_id?: string
          expedition_member_id?: string
          id?: string
          participant_key?: string
          participant_order?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "participants_expedition_id_fkey"
            columns: ["expedition_id"]
            isOneToOne: false
            referencedRelation: "expeditions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "participants_member_expedition_fk"
            columns: ["expedition_member_id", "expedition_id"]
            isOneToOne: false
            referencedRelation: "expedition_members"
            referencedColumns: ["id", "expedition_id"]
          },
        ]
      }
      profiles: {
        Row: {
          auth_user_id: string | null
          created_at: string
          display_name: string | null
          id: string
          status: string
          updated_at: string
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          status?: string
          updated_at?: string
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      runtime_releases: {
        Row: {
          content_release: string
          created_at: string
          git_commit_sha: string
          id: string
          reducer_version: string
          release_key: string
          rules_release: string
        }
        Insert: {
          content_release: string
          created_at?: string
          git_commit_sha: string
          id?: string
          reducer_version: string
          release_key: string
          rules_release: string
        }
        Update: {
          content_release?: string
          created_at?: string
          git_commit_sha?: string
          id?: string
          reducer_version?: string
          release_key?: string
          rules_release?: string
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
  private: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      resolve_actor_context: {
        Args: { p_auth_user_id: string; p_expedition_id: string }
        Returns: {
          expedition_member_id: string
          membership_role: string
          participant_id: string
          profile_id: string
        }[]
      }
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
  api: {
    Enums: {},
  },
  ilka: {
    Enums: {},
  },
  private: {
    Enums: {},
  },
} as const
