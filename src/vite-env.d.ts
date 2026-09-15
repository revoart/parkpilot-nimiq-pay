/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_PLATFORM_PAYMENT_ADDRESS?: string
  readonly VITE_POLYGON_CHAIN_ID?: string
  readonly VITE_POLYGON_CHAIN_ID_DECIMAL?: string
  readonly VITE_POLYGON_RPC_URL?: string
  readonly VITE_USDT_CONTRACT_ADDRESS?: string
  readonly VITE_USDT_DECIMALS?: string
  readonly VITE_BLOCK_EXPLORER_URL?: string
  readonly VITE_APP_MODE?: string
  readonly VITE_GOOGLE_MAPS_API_KEY?: string
  readonly VITE_GOOGLE_MAPS_TRACKING_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface Eip1193RequestArguments {
  method: string
  params?: unknown[] | Record<string, unknown>
}

interface InjectedEthereumProvider {
  request(args: Eip1193RequestArguments): Promise<unknown>
  on?(event: string, handler: (...args: unknown[]) => void): void
  removeListener?(event: string, handler: (...args: unknown[]) => void): void
}

interface Window {
  ethereum?: InjectedEthereumProvider
  nimiqPay?: {
    language?: string
  }
  /** Invoked by the Google Maps JS API when the API key is missing or rejected. */
  gm_authFailure?: () => void
}
