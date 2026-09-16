/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_APP_MODE?: string
  /** Nimiq block explorer base URL. Defaults to https://nimiq.watch */
  readonly VITE_NIMIQ_EXPLORER_URL?: string
  readonly VITE_GOOGLE_MAPS_API_KEY?: string
  readonly VITE_GOOGLE_MAPS_TRACKING_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface Window {
  /** Injected by Nimiq Pay. The only wallet the app talks to. */
  nimiqPay?: {
    language?: string
  }
  /** Invoked by the Google Maps JS API when the API key is missing or rejected. */
  gm_authFailure?: () => void
}
