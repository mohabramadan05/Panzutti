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
      addresses: {
        Row: {
          address_line: string
          apartment: string | null
          building: string | null
          created_at: string
          floor: string | null
          id: string
          is_default: boolean
          label: string
          notes: string | null
          updated_at: string
          user_id: string
          zone_id: string | null
        }
        Insert: {
          address_line: string
          apartment?: string | null
          building?: string | null
          created_at?: string
          floor?: string | null
          id?: string
          is_default?: boolean
          label?: string
          notes?: string | null
          updated_at?: string
          user_id: string
          zone_id?: string | null
        }
        Update: {
          address_line?: string
          apartment?: string | null
          building?: string | null
          created_at?: string
          floor?: string | null
          id?: string
          is_default?: boolean
          label?: string
          notes?: string | null
          updated_at?: string
          user_id?: string
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "addresses_zone_fk"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "delivery_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      articles: {
        Row: {
          author: string | null
          body: string
          category: string | null
          cover_url: string | null
          created_at: string
          excerpt: string | null
          id: string
          is_featured: boolean
          published_at: string | null
          slug: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          author?: string | null
          body?: string
          category?: string | null
          cover_url?: string | null
          created_at?: string
          excerpt?: string | null
          id?: string
          is_featured?: boolean
          published_at?: string | null
          slug: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          author?: string | null
          body?: string
          category?: string | null
          cover_url?: string | null
          created_at?: string
          excerpt?: string | null
          id?: string
          is_featured?: boolean
          published_at?: string | null
          slug?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_visible: boolean
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_visible?: boolean
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_visible?: boolean
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      delivery_zones: {
        Row: {
          created_at: string
          eta_minutes: number | null
          fee: number
          id: string
          is_active: boolean
          min_order: number
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          eta_minutes?: number | null
          fee?: number
          id?: string
          is_active?: boolean
          min_order?: number
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          eta_minutes?: number | null
          fee?: number
          id?: string
          is_active?: boolean
          min_order?: number
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      driver_assignments: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          driver_id: string
          id: string
          order_id: string
          reason: string | null
          unassigned_at: string | null
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          driver_id: string
          id?: string
          order_id: string
          reason?: string | null
          unassigned_at?: string | null
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          driver_id?: string
          id?: string
          order_id?: string
          reason?: string | null
          unassigned_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "driver_assignments_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_assignments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      drivers: {
        Row: {
          created_at: string
          full_name: string
          id: string
          is_active: boolean
          is_available: boolean
          notes: string | null
          phone: string
          photo_url: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name: string
          id?: string
          is_active?: boolean
          is_available?: boolean
          notes?: string | null
          phone: string
          photo_url?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          is_active?: boolean
          is_available?: boolean
          notes?: string | null
          phone?: string
          photo_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      opening_hours: {
        Row: {
          close_time: string
          is_closed: boolean
          open_time: string
          weekday: number
        }
        Insert: {
          close_time?: string
          is_closed?: boolean
          open_time?: string
          weekday: number
        }
        Update: {
          close_time?: string
          is_closed?: boolean
          open_time?: string
          weekday?: number
        }
        Relationships: []
      }
      option_groups: {
        Row: {
          created_at: string
          id: string
          is_required: boolean
          max_select: number
          min_select: number
          name: string
          product_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_required?: boolean
          max_select?: number
          min_select?: number
          name: string
          product_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_required?: boolean
          max_select?: number
          min_select?: number
          name?: string
          product_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "option_groups_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      options: {
        Row: {
          created_at: string
          group_id: string
          id: string
          is_available: boolean
          name: string
          price_delta: number
          sort_order: number
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          is_available?: boolean
          name: string
          price_delta?: number
          sort_order?: number
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          is_available?: boolean
          name?: string
          price_delta?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "options_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "option_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          id: string
          line_total: number
          notes: string | null
          options: Json
          order_id: string
          product_id: string | null
          product_name: string
          quantity: number
          unit_price: number
        }
        Insert: {
          id?: string
          line_total: number
          notes?: string | null
          options?: Json
          order_id: string
          product_id?: string | null
          product_name: string
          quantity: number
          unit_price: number
        }
        Update: {
          id?: string
          line_total?: number
          notes?: string | null
          options?: Json
          order_id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      order_notifications: {
        Row: {
          channel: string
          created_at: string
          event: string
          id: string
          order_id: string
          sent_at: string | null
          status: string
        }
        Insert: {
          channel?: string
          created_at?: string
          event: string
          id?: string
          order_id: string
          sent_at?: string | null
          status?: string
        }
        Update: {
          channel?: string
          created_at?: string
          event?: string
          id?: string
          order_id?: string
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_notifications_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_status_history: {
        Row: {
          changed_by: string | null
          created_at: string
          id: string
          note: string | null
          order_id: string
          status: Database["public"]["Enums"]["order_status"]
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          id?: string
          note?: string | null
          order_id: string
          status: Database["public"]["Enums"]["order_status"]
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          id?: string
          note?: string | null
          order_id?: string
          status?: Database["public"]["Enums"]["order_status"]
        }
        Relationships: [
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          address: string | null
          cancel_reason: string | null
          client_request_id: string | null
          created_at: string
          customer_name: string
          delivery_fee: number
          delivery_notes: string | null
          driver_id: string | null
          estimate_note: string | null
          estimated_delivery_at: string | null
          estimated_ready_at: string | null
          fulfillment: Database["public"]["Enums"]["fulfillment_type"]
          id: string
          lat: number | null
          lng: number | null
          notes: string | null
          order_number: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          payment_status: Database["public"]["Enums"]["payment_status"]
          phone: string
          points_awarded: number
          points_redeemed: number
          prep_minutes: number | null
          promo_code: string | null
          promo_discount: number
          redeemed_refunded: boolean
          reservation_id: string | null
          reward_discount: number
          reward_tier_id: string | null
          scheduled_for: string | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          table_number: string | null
          total: number
          tracking_token: string
          updated_at: string
          user_id: string | null
          zone_id: string | null
        }
        Insert: {
          address?: string | null
          cancel_reason?: string | null
          client_request_id?: string | null
          created_at?: string
          customer_name: string
          delivery_fee?: number
          delivery_notes?: string | null
          driver_id?: string | null
          estimate_note?: string | null
          estimated_delivery_at?: string | null
          estimated_ready_at?: string | null
          fulfillment: Database["public"]["Enums"]["fulfillment_type"]
          id?: string
          lat?: number | null
          lng?: number | null
          notes?: string | null
          order_number?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          payment_status?: Database["public"]["Enums"]["payment_status"]
          phone: string
          points_awarded?: number
          points_redeemed?: number
          prep_minutes?: number | null
          promo_code?: string | null
          promo_discount?: number
          redeemed_refunded?: boolean
          reservation_id?: string | null
          reward_discount?: number
          reward_tier_id?: string | null
          scheduled_for?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          table_number?: string | null
          total?: number
          tracking_token?: string
          updated_at?: string
          user_id?: string | null
          zone_id?: string | null
        }
        Update: {
          address?: string | null
          cancel_reason?: string | null
          client_request_id?: string | null
          created_at?: string
          customer_name?: string
          delivery_fee?: number
          delivery_notes?: string | null
          driver_id?: string | null
          estimate_note?: string | null
          estimated_delivery_at?: string | null
          estimated_ready_at?: string | null
          fulfillment?: Database["public"]["Enums"]["fulfillment_type"]
          id?: string
          lat?: number | null
          lng?: number | null
          notes?: string | null
          order_number?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          payment_status?: Database["public"]["Enums"]["payment_status"]
          phone?: string
          points_awarded?: number
          points_redeemed?: number
          prep_minutes?: number | null
          promo_code?: string | null
          promo_discount?: number
          redeemed_refunded?: boolean
          reservation_id?: string | null
          reward_discount?: number
          reward_tier_id?: string | null
          scheduled_for?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          table_number?: string | null
          total?: number
          tracking_token?: string
          updated_at?: string
          user_id?: string | null
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_reward_tier_id_fkey"
            columns: ["reward_tier_id"]
            isOneToOne: false
            referencedRelation: "reward_tiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "delivery_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      points_ledger: {
        Row: {
          created_at: string
          created_by: string | null
          delta: number
          id: string
          note: string | null
          order_id: string | null
          reason: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          delta: number
          id?: string
          note?: string | null
          order_id?: string | null
          reason: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          delta?: number
          id?: string
          note?: string | null
          order_id?: string | null
          reason?: string
          user_id?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          allergens: string | null
          category_id: string | null
          created_at: string
          description: string | null
          gallery: string[]
          id: string
          image_url: string | null
          ingredients: string | null
          is_available: boolean
          is_bestseller: boolean
          is_featured: boolean
          is_published: boolean
          name: string
          name_ar: string | null
          prep_minutes: number
          prep_notes: string | null
          price: number
          short_description: string | null
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          allergens?: string | null
          category_id?: string | null
          created_at?: string
          description?: string | null
          gallery?: string[]
          id?: string
          image_url?: string | null
          ingredients?: string | null
          is_available?: boolean
          is_bestseller?: boolean
          is_featured?: boolean
          is_published?: boolean
          name: string
          name_ar?: string | null
          prep_minutes?: number
          prep_notes?: string | null
          price?: number
          short_description?: string | null
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          allergens?: string | null
          category_id?: string | null
          created_at?: string
          description?: string | null
          gallery?: string[]
          id?: string
          image_url?: string | null
          ingredients?: string | null
          is_available?: boolean
          is_bestseller?: boolean
          is_featured?: boolean
          is_published?: boolean
          name?: string
          name_ar?: string | null
          prep_minutes?: number
          prep_notes?: string | null
          price?: number
          short_description?: string | null
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          marketing_opt_in: boolean
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          marketing_opt_in?: boolean
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          marketing_opt_in?: boolean
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      promotions: {
        Row: {
          code: string
          created_at: string
          description: string | null
          ends_at: string | null
          id: string
          is_active: boolean
          kind: string
          max_uses: number | null
          min_order: number
          starts_at: string | null
          uses: number
          value: number
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          ends_at?: string | null
          id?: string
          is_active?: boolean
          kind?: string
          max_uses?: number | null
          min_order?: number
          starts_at?: string | null
          uses?: number
          value: number
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          ends_at?: string | null
          id?: string
          is_active?: boolean
          kind?: string
          max_uses?: number | null
          min_order?: number
          starts_at?: string | null
          uses?: number
          value?: number
        }
        Relationships: []
      }
      reservations: {
        Row: {
          admin_notes: string | null
          created_at: string
          customer_name: string
          guests: number
          id: string
          notes: string | null
          phone: string
          reserved_date: string
          reserved_time: string
          status: Database["public"]["Enums"]["reservation_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string
          customer_name: string
          guests: number
          id?: string
          notes?: string | null
          phone: string
          reserved_date: string
          reserved_time: string
          status?: Database["public"]["Enums"]["reservation_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_notes?: string | null
          created_at?: string
          customer_name?: string
          guests?: number
          id?: string
          notes?: string | null
          phone?: string
          reserved_date?: string
          reserved_time?: string
          status?: Database["public"]["Enums"]["reservation_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      reviews: {
        Row: {
          admin_edited: boolean
          admin_note: string | null
          body: string | null
          created_at: string
          created_by: string | null
          customer_email: string | null
          customer_name: string | null
          edited_at: string | null
          edited_by: string | null
          id: string
          kind: string
          order_id: string | null
          product_id: string | null
          rating: number
          source: string
          status: string
          title: string | null
          updated_at: string
          user_id: string | null
          verified_purchase: boolean
        }
        Insert: {
          admin_edited?: boolean
          admin_note?: string | null
          body?: string | null
          created_at?: string
          created_by?: string | null
          customer_email?: string | null
          customer_name?: string | null
          edited_at?: string | null
          edited_by?: string | null
          id?: string
          kind: string
          order_id?: string | null
          product_id?: string | null
          rating: number
          source?: string
          status?: string
          title?: string | null
          updated_at?: string
          user_id?: string | null
          verified_purchase?: boolean
        }
        Update: {
          admin_edited?: boolean
          admin_note?: string | null
          body?: string | null
          created_at?: string
          created_by?: string | null
          customer_email?: string | null
          customer_name?: string | null
          edited_at?: string | null
          edited_by?: string | null
          id?: string
          kind?: string
          order_id?: string | null
          product_id?: string | null
          rating?: number
          source?: string
          status?: string
          title?: string | null
          updated_at?: string
          user_id?: string | null
          verified_purchase?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "reviews_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      reward_tiers: {
        Row: {
          discount: number
          id: string
          is_active: boolean
          min_order: number
          points: number
        }
        Insert: {
          discount: number
          id?: string
          is_active?: boolean
          min_order?: number
          points: number
        }
        Update: {
          discount?: number
          id?: string
          is_active?: boolean
          min_order?: number
          points?: number
        }
        Relationships: []
      }
      site_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
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
      admin_adjust_estimate: {
        Args: { _minutes: number; _order: string; _reason: string }
        Returns: undefined
      }
      admin_adjust_points: {
        Args: { _delta: number; _note: string; _user_id: string }
        Returns: number
      }
      admin_assign_driver: {
        Args: { _driver: string; _order: string; _reason?: string }
        Returns: undefined
      }
      admin_customers: {
        Args: never
        Returns: {
          created_at: string
          email: string
          full_name: string
          id: string
          orders_count: number
          phone: string
          points: number
          total_spent: number
        }[]
      }
      admin_review_stats: { Args: never; Returns: Json }
      admin_update_order_status: {
        Args: {
          _note?: string
          _order: string
          _status: Database["public"]["Enums"]["order_status"]
        }
        Returns: undefined
      }
      assert_can_order: {
        Args: { _f: string; _ts: string }
        Returns: undefined
      }
      calc_prep_minutes: { Args: { _items: Json }; Returns: number }
      cancel_my_reservation: { Args: { _id: string }; Returns: undefined }
      create_reservation: {
        Args: {
          _date: string
          _guests: number
          _name: string
          _notes: string
          _phone: string
          _time: string
        }
        Returns: string
      }
      get_tracked_order: { Args: { _token: string }; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      in_window: {
        Args: { _end: string; _start: string; _ts: string }
        Returns: boolean
      }
      is_open_at: { Args: { _ts: string }; Returns: boolean }
      my_points_balance: { Args: never; Returns: number }
      order_next_statuses: {
        Args: {
          _f: Database["public"]["Enums"]["fulfillment_type"]
          _s: Database["public"]["Enums"]["order_status"]
        }
        Returns: Database["public"]["Enums"]["order_status"][]
      }
      order_review_state: { Args: { _token: string }; Returns: Json }
      pickup_slots: { Args: { _items: Json }; Returns: Json }
      place_order: { Args: { _p: Json }; Returns: Json }
      points_balance: { Args: { _user_id: string }; Returns: number }
      price_cart: { Args: { _items: Json }; Returns: Json }
      product_ratings: {
        Args: never
        Returns: {
          avg_rating: number
          product_id: string
          review_count: number
        }[]
      }
      product_review_summary: { Args: { _product: string }; Returns: Json }
      product_reviews: {
        Args: {
          _limit?: number
          _offset?: number
          _product: string
          _sort?: string
        }
        Returns: {
          body: string
          created_at: string
          display_name: string
          id: string
          rating: number
          title: string
          verified: boolean
        }[]
      }
      quote_order: { Args: { _p: Json }; Returns: Json }
      review_display_name: { Args: { _name: string }; Returns: string }
      review_kinds_for: {
        Args: { _f: Database["public"]["Enums"]["fulfillment_type"] }
        Returns: string[]
      }
      slot_availability: {
        Args: { _date: string }
        Returns: {
          booked: number
          capacity: number
          slot: string
        }[]
      }
      submit_order_reviews: {
        Args: { _reviews: Json; _token: string }
        Returns: Json
      }
      timing_cfg: { Args: never; Returns: Json }
    }
    Enums: {
      app_role: "admin" | "customer"
      fulfillment_type: "delivery" | "pickup" | "dine_in"
      order_status:
        | "pending"
        | "confirmed"
        | "preparing"
        | "ready"
        | "driver_assigned"
        | "picked_up"
        | "out_for_delivery"
        | "delivered"
        | "collected"
        | "completed"
        | "cancelled"
        | "refunded"
      payment_method: "cash" | "card"
      payment_status: "unpaid" | "paid" | "refunded" | "failed"
      reservation_status:
        | "pending"
        | "confirmed"
        | "rejected"
        | "cancelled"
        | "completed"
        | "no_show"
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
      app_role: ["admin", "customer"],
      fulfillment_type: ["delivery", "pickup", "dine_in"],
      order_status: [
        "pending",
        "confirmed",
        "preparing",
        "ready",
        "driver_assigned",
        "picked_up",
        "out_for_delivery",
        "delivered",
        "collected",
        "completed",
        "cancelled",
        "refunded",
      ],
      payment_method: ["cash", "card"],
      payment_status: ["unpaid", "paid", "refunded", "failed"],
      reservation_status: [
        "pending",
        "confirmed",
        "rejected",
        "cancelled",
        "completed",
        "no_show",
      ],
    },
  },
} as const
