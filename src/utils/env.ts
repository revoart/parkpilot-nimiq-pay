export type AppMode = 'production' | 'development'

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

export const env = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  /** Nimiq block explorer. Payments are NIM on the Nimiq chain. */
  blockExplorerUrl:
    import.meta.env.VITE_NIMIQ_EXPLORER_URL ?? 'https://nimiq.watch',
  appMode: (import.meta.env.VITE_APP_MODE ?? 'production') as AppMode,
} as const

export const isDevelopmentMode = env.appMode === 'development'

export function requireSupabase(): { url: string; anonKey: string } {
  return {
    url: required('VITE_SUPABASE_URL', env.supabaseUrl),
    anonKey: required('VITE_SUPABASE_ANON_KEY', env.supabaseAnonKey),
  }
}
