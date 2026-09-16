import { LUNA_PER_NIM } from './amounts'

/**
 * Displaying a NIM price in USDT.
 *
 * NIM trades around a fraction of a cent, so a listing priced "5000" is
 * meaningless on its own — 5,000 NIM is roughly two dollars. Every price and
 * balance is therefore shown with a dollar equivalent beside it.
 *
 * The stored price stays NIM. This is a display concern only, so it never feeds
 * back into what a driver pays or a host earns.
 */

/**
 * Past this age the equivalent is hidden rather than shown.
 *
 * A wrong dollar figure is worse than no dollar figure: someone could price a
 * space or approve a payment against it. The rate is cached for a minute
 * server-side, so anything beyond a quarter hour means the price service is
 * having trouble and the honest response is to show nothing.
 */
export const MAX_EQUIVALENT_AGE_MS = 15 * 60_000

/** USDT value of a Luna amount at the given USDT-per-NIM rate. */
export function usdtValueOfLuna(luna: bigint, rateUsdt: number): number {
  if (!Number.isFinite(rateUsdt) || rateUsdt <= 0) return 0
  if (luna <= 0n) return 0
  return (Number(luna) / Number(LUNA_PER_NIM)) * rateUsdt
}

/**
 * USDT value of a NIM amount.
 *
 * Accepts the decimal strings the database returns (prices and ledger amounts
 * are stored as numeric NIM, not Luna).
 */
export function usdtValueOfNim(
  nim: string | number | null | undefined,
  rateUsdt: number,
): number {
  if (!Number.isFinite(rateUsdt) || rateUsdt <= 0) return 0
  if (nim === null || nim === undefined) return 0

  const amount = typeof nim === 'number' ? nim : Number(nim)
  if (!Number.isFinite(amount) || amount <= 0) return 0

  return amount * rateUsdt
}

/**
 * Format a dollar amount for display.
 *
 * Amounts below a cent are reported as "<0.01" rather than rounded to "0.00",
 * which would read as free when it is not.
 */
export function formatUsdtAmount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0.00'
  if (value < 0.01) return '<0.01'
  return value.toFixed(2)
}

/** Whether a rate fetched at `fetchedAt` is recent enough to display. */
export function isRateFresh(fetchedAt: string | null, now = Date.now()): boolean {
  if (!fetchedAt) return false
  const time = new Date(fetchedAt).getTime()
  if (!Number.isFinite(time)) return false
  return now - time < MAX_EQUIVALENT_AGE_MS
}
