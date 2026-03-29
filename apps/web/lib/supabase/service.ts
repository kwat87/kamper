import { createClient } from '@supabase/supabase-js'

/**
 * Service role client — bypasses RLS entirely.
 * ONLY use in Route Handlers or Server Actions for operations that are
 * explicitly authorized by application logic (e.g. admin CSV import).
 * Never expose to the client or use in Server Components that render UI.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY

  if (!url || !key) {
    throw new Error('Missing SUPABASE_SECRET_KEY — service client is server-only')
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
