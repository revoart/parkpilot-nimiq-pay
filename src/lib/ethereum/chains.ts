import { env } from '@/utils/env'

export const POLYGON_CHAIN_ID_HEX = env.polygonChainIdHex
export const POLYGON_CHAIN_ID = env.polygonChainId

export const POLYGON_CHAIN_PARAMS = {
  chainId: POLYGON_CHAIN_ID_HEX,
  chainName: 'Polygon',
  nativeCurrency: {
    name: 'POL',
    symbol: 'POL',
    decimals: 18,
  },
  rpcUrls: [env.polygonRpcUrl],
  blockExplorerUrls: [env.blockExplorerUrl],
} as const
