import { parseAbi } from 'viem'

import { env } from '@/utils/env'

/** USDT contract address for the configured chain (Polygon mainnet by default). */
export const USDT_ADDRESS = env.usdtContractAddress as `0x${string}`

/** USDT uses 6 decimals (NOT 18). */
export const USDT_DECIMALS = env.usdtDecimals

/** Minimal ERC-20 ABI for balance reads and transfers. */
export const ERC20_ABI = parseAbi([
  'function balanceOf(address account) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
])

/** keccak256("Transfer(address,address,uint256)") — used by the verifier. */
export const ERC20_TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
