/**
 * NIM amount handling.
 *
 * Nimiq amounts are integers in Luna: 1 NIM = 100,000 Luna, so NIM has five
 * decimal places. All conversion here is integer arithmetic on decimal
 * strings — floating point is never used for money.
 */

/** 1 NIM = 100,000 Luna. */
export const LUNA_PER_NIM = 100_000n

export const NIM_DECIMALS = 5

/**
 * Nimiq's entire supply (21e9 NIM = 2.1e15 Luna) sits below 2^53, so Luna
 * amounts are safe to hand to the provider as JS numbers. Larger values are
 * rejected rather than silently rounded.
 */
const MAX_SAFE_LUNA = BigInt(Number.MAX_SAFE_INTEGER)

/**
 * Convert a human-readable NIM amount to integer Luna.
 *
 * Rejects precision finer than a single Luna instead of truncating: a price
 * that cannot be represented on-chain should fail loudly, not round to zero.
 */
export function nimToLuna(value: string | number | bigint): bigint {
  if (typeof value === 'bigint') return value * LUNA_PER_NIM

  const text = String(value).trim()
  if (!/^\d+(\.\d+)?$/.test(text)) {
    throw new Error(`Invalid NIM amount: ${text}`)
  }

  const [whole, fraction = ''] = text.split('.')
  const excess = fraction.slice(NIM_DECIMALS)
  if (/[1-9]/.test(excess)) {
    throw new Error(
      `NIM amounts cannot be smaller than one Luna (${NIM_DECIMALS} decimals).`,
    )
  }

  const padded = fraction.slice(0, NIM_DECIMALS).padEnd(NIM_DECIMALS, '0')
  return BigInt(whole) * LUNA_PER_NIM + BigInt(padded)
}

/** Convert integer Luna to a human-readable NIM string. */
export function lunaToNim(luna: bigint | number): string {
  const value = typeof luna === 'bigint' ? luna : BigInt(luna)
  const negative = value < 0n
  const absolute = negative ? -value : value

  const whole = absolute / LUNA_PER_NIM
  const fraction = (absolute % LUNA_PER_NIM)
    .toString()
    .padStart(NIM_DECIMALS, '0')
  const trimmed = fraction.replace(/0+$/, '')
  const result = trimmed ? `${whole}.${trimmed}` : `${whole}`

  return negative ? `-${result}` : result
}

/**
 * Narrow Luna to a JS number for the provider API, which takes `number`.
 * Throws rather than rounding, so an out-of-range amount can never be sent.
 */
export function lunaToNumber(luna: bigint): number {
  if (luna > MAX_SAFE_LUNA || luna < -MAX_SAFE_LUNA) {
    throw new Error('Luna amount exceeds the safe integer range.')
  }
  return Number(luna)
}

/** True when the amount is a positive whole number of Luna. */
export function isPositiveLuna(luna: bigint): boolean {
  return luna > 0n
}
