import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

/**
 * Null when env vars are absent (e.g. a fresh clone): the app then runs
 * local-only and the Profile screen explains how to enable backup.
 * Never put a service-role/secret key here — publishable key only.
 */
export const supabase: SupabaseClient | null =
  url && key ? createClient(url, key) : null
