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
  platformPaymentAddress: import.meta.env.VITE_PLATFORM_PAYMENT_ADDRESS,
  polygonChainIdHex: import.meta.env.VITE_POLYGON_CHAIN_ID ?? '0x89',
  polygonChainId: Number(import.meta.env.VITE_POLYGON_CHAIN_ID_DECIMAL ?? 137),
  polygonRpcUrl:
    import.meta.env.VITE_POLYGON_RPC_URL ?? 'https://polygon-rpc.com',
  usdtContractAddress:
    import.meta.env.VITE_USDT_CONTRACT_ADDRESS ??
    '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
  usdtDecimals: Number(import.meta.env.VITE_USDT_DECIMALS ?? 6),
  blockExplorerUrl:
    import.meta.env.VITE_BLOCK_EXPLORER_URL ?? 'https://polygonscan.com',
  appMode: (import.meta.env.VITE_APP_MODE ?? 'production') as AppMode,
} as const

export const isDevelopmentMode = env.appMode === 'development'

export function requireSupabase(): { url: string; anonKey: string } {
  return {
    url: required('VITE_SUPABASE_URL', env.supabaseUrl),
    anonKey: required('VITE_SUPABASE_ANON_KEY', env.supabaseAnonKey),
  }
}
