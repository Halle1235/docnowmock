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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          changed_fields: string[] | null
          id: number
          new_data: Json | null
          occurred_at: string
          old_data: Json | null
          record_id: string | null
          table_name: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          changed_fields?: string[] | null
          id?: number
          new_data?: Json | null
          occurred_at?: string
          old_data?: Json | null
          record_id?: string | null
          table_name: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          changed_fields?: string[] | null
          id?: number
          new_data?: Json | null
          occurred_at?: string
          old_data?: Json | null
          record_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      consultations: {
        Row: {
          claimed_at: string | null
          completed_at: string | null
          consent_version: string | null
          created_at: string | null
          doctor_id: string | null
          emergency_disclaimer_ack_at: string | null
          id: string
          notes: string | null
          patient_id: string
          payment_amount: number | null
          payment_status: string
          prescription: string | null
          prescription_no_controlled_ack: boolean
          privacy_consent_at: string | null
          reason_category: string | null
          reason_description: string | null
          room_closed_at: string | null
          room_url: string | null
          scheduled_at: string | null
          status: string
          telehealth_consent_at: string | null
          updated_at: string | null
          visit_summary: Json | null
          visit_summary_approved_at: string | null
          visit_summary_approved_by: string | null
          visit_summary_generated_at: string | null
        }
        Insert: {
          claimed_at?: string | null
          completed_at?: string | null
          consent_version?: string | null
          created_at?: string | null
          doctor_id?: string | null
          emergency_disclaimer_ack_at?: string | null
          id?: string
          notes?: string | null
          patient_id: string
          payment_amount?: number | null
          payment_status?: string
          prescription?: string | null
          prescription_no_controlled_ack?: boolean
          privacy_consent_at?: string | null
          reason_category?: string | null
          reason_description?: string | null
          room_closed_at?: string | null
          room_url?: string | null
          scheduled_at?: string | null
          status?: string
          telehealth_consent_at?: string | null
          updated_at?: string | null
          visit_summary?: Json | null
          visit_summary_approved_at?: string | null
          visit_summary_approved_by?: string | null
          visit_summary_generated_at?: string | null
        }
        Update: {
          claimed_at?: string | null
          completed_at?: string | null
          consent_version?: string | null
          created_at?: string | null
          doctor_id?: string | null
          emergency_disclaimer_ack_at?: string | null
          id?: string
          notes?: string | null
          patient_id?: string
          payment_amount?: number | null
          payment_status?: string
          prescription?: string | null
          prescription_no_controlled_ack?: boolean
          privacy_consent_at?: string | null
          reason_category?: string | null
          reason_description?: string | null
          room_closed_at?: string | null
          room_url?: string | null
          scheduled_at?: string | null
          status?: string
          telehealth_consent_at?: string | null
          updated_at?: string | null
          visit_summary?: Json | null
          visit_summary_approved_at?: string | null
          visit_summary_approved_by?: string | null
          visit_summary_generated_at?: string | null
        }
        Relationships: []
      }
      doctor_profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          id: string
          is_available: boolean | null
          is_verified: boolean | null
          license_number: string
          specialization: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          id?: string
          is_available?: boolean | null
          is_verified?: boolean | null
          license_number: string
          specialization: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          id?: string
          is_available?: boolean | null
          is_verified?: boolean | null
          license_number?: string
          specialization?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      patient_journal_entries: {
        Row: {
          consultation_id: string
          created_at: string
          diagnosis: string
          doctor_id: string
          doctor_name: string
          id: string
          license_number: string
          notes: string
          patient_id: string
          treatment: string
        }
        Insert: {
          consultation_id: string
          created_at?: string
          diagnosis?: string
          doctor_id: string
          doctor_name: string
          id?: string
          license_number: string
          notes: string
          patient_id: string
          treatment?: string
        }
        Update: {
          consultation_id?: string
          created_at?: string
          diagnosis?: string
          doctor_id?: string
          doctor_name?: string
          id?: string
          license_number?: string
          notes?: string
          patient_id?: string
          treatment?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_journal_entries_consultation_id_fkey"
            columns: ["consultation_id"]
            isOneToOne: false
            referencedRelation: "consultations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_journal_entries_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          allergies: string | null
          created_at: string | null
          date_of_birth: string | null
          email: string
          full_name: string
          id: string
          passport_number: string | null
          phone: string | null
          updated_at: string | null
        }
        Insert: {
          allergies?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          email: string
          full_name: string
          id: string
          passport_number?: string | null
          phone?: string | null
          updated_at?: string | null
        }
        Update: {
          allergies?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          email?: string
          full_name?: string
          id?: string
          passport_number?: string | null
          phone?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      visit_summary_drafts: {
        Row: {
          consultation_id: string
          generated_at: string
          summary: Json
        }
        Insert: {
          consultation_id: string
          generated_at?: string
          summary: Json
        }
        Update: {
          consultation_id?: string
          generated_at?: string
          summary?: Json
        }
        Relationships: [
          {
            foreignKeyName: "visit_summary_drafts_consultation_id_fkey"
            columns: ["consultation_id"]
            isOneToOne: true
            referencedRelation: "consultations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_patient_journal_entry: {
        Args: {
          _consultation_id: string
          _diagnosis: string
          _notes: string
          _treatment: string
        }
        Returns: string
      }
      audit_patient_record_read: {
        Args: { _id: string; _table: string }
        Returns: boolean
      }
      audit_summary_draft_read: {
        Args: { _consultation_id: string }
        Returns: boolean
      }
      claim_patient_consultation: {
        Args: { _consultation_id: string }
        Returns: undefined
      }
      get_authorized_call_record: {
        Args: { _consultation_id: string }
        Returns: Json
      }
      get_authorized_summary_draft: {
        Args: { _consultation_id: string }
        Returns: Json
      }
      get_consultation_patient: {
        Args: { _consultation_id: string }
        Returns: Json
      }
      get_queue_status: { Args: { _consultation_id: string }; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_authorized_doctor: { Args: { _user_id: string }; Returns: boolean }
      list_admin_profiles: {
        Args: never
        Returns: {
          allergies: string | null
          created_at: string | null
          date_of_birth: string | null
          email: string
          full_name: string
          id: string
          passport_number: string | null
          phone: string | null
          updated_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      list_doctor_consultations: { Args: never; Returns: Json }
      list_patient_journal: {
        Args: { _before?: string; _consultation_id: string }
        Returns: Json
      }
    }
    Enums: {
      app_role: "patient" | "doctor" | "admin"
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
      app_role: ["patient", "doctor", "admin"],
    },
  },
} as const
