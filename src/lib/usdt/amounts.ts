import { formatUnits, parseUnits } from 'viem'

import { USDT_DECIMALS } from './constants'

/**
 * Convert a human-readable USDT amount to raw on-chain units using bigint.
 * Never use floating-point arithmetic for token amounts.
 */
export function toRawAmount(
  amount: string | number,
  decimals: number = USDT_DECIMALS,
): bigint {
  return parseUnits(String(amount), decimals)
}

/** Convert raw on-chain units to a human-readable decimal string. */
export function fromRawAmount(
  raw: bigint,
  decimals: number = USDT_DECIMALS,
): string {
  return formatUnits(raw, decimals)
}
