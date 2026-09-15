import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { requireSupabase } from '@/utils/env'

import type { Database } from './database.types'

let client: SupabaseClient<Database> | null = null

/**
 * Supabase client for the frontend. Uses the anon/publishable key only.
 * The service-role key never reaches the browser — it lives in Edge Function
 * secrets.
 */
export function getSupabase(): SupabaseClient<Database> {
  if (!client) {
    const { url, anonKey } = requireSupabase()
    client = createClient<Database>(url, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    })
  }
  return client
}
