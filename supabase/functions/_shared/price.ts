/**
 * NIM/USDT rate sourcing.
 *
 * Prices are stored in NIM, but a listing priced "5000" means nothing to a host
 * or driver without a dollar figure beside it. This module gets that figure.
 *
 * Three venues are queried and the **median** is taken. That is the whole
 * robustness story: with three independent sources, one venue returning a stale
 * or malformed price cannot move the result, because the median ignores an
 * outlier. No hand-tuned thresholds to maintain.
 *
 * All three expose a direct NIM/USDT pair, so no USD-proxy fudging is needed.
 * CoinGecko is deliberately not used: its free tier rate-limits aggressively and
 * it carries two different "Nimiq" entries that differ by ~75x.
 *
 * Deliberately dependency-free (like `./nimiq.ts`) so it can be unit tested.
 */

/** How long a cached rate is served before another upstream fetch. */
export const NIM_PRICE_TTL_MS = 60_000

/**
 * A rate this far from the previous one is treated as a bad reading rather than
 * a real move. 20x is far beyond any plausible 60-second change; it exists to
 * catch a unit error such as a venue quoting per-1000-NIM.
 */
export const MAX_RATE_DRIFT = 20

export interface Venue {
  name: string
  url: string
  parse: (payload: unknown) => number | null
}

/** Read a numeric field, rejecting anything that is not a positive number. */
function positiveNumber(value: unknown): number | null {
  const parsed = typeof value === 'string' ? Number(value) : value
  if (typeof parsed !== 'number' || !Number.isFinite(parsed) || parsed <= 0) {
    return null
  }
  return parsed
}

export const VENUES: Venue[] = [
  {
    name: 'mexc',
    url: 'https://api.mexc.com/api/v3/ticker/price?symbol=NIMUSDT',
    parse: (payload) =>
      positiveNumber((payload as { price?: unknown } | null)?.price),
  },
  {
    name: 'gate',
    url: 'https://api.gateio.ws/api/v4/spot/tickers?currency_pair=NIM_USDT',
    parse: (payload) => {
      const first = Array.isArray(payload) ? payload[0] : null
      return positiveNumber((first as { last?: unknown } | null)?.last)
    },
  },
  {
    name: 'kucoin',
    url: 'https://api.kucoin.com/api/v1/market/orderbook/level1?symbol=NIM-USDT',
    parse: (payload) => {
      const data = (payload as { data?: unknown } | null)?.data
      return positiveNumber((data as { price?: unknown } | null)?.price)
    },
  },
]

/** Median of the readings that arrived. Null when none did. */
export function medianRate(rates: number[]): number | null {
  const usable = rates.filter(
    (rate) => Number.isFinite(rate) && rate > 0,
  )
  if (usable.length === 0) return null

  const sorted = [...usable].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)

  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2
}

/**
 * Whether a fresh reading is plausible given the last one.
 *
 * The median already rejects a single bad venue. This is the second line: it
 * catches the case where every venue answers with a unit error.
 */
export function isPlausibleRate(rate: number, previous: number | null): boolean {
  if (!Number.isFinite(rate) || rate <= 0) return false
  if (previous === null || !Number.isFinite(previous) || previous <= 0) return true

  const ratio = rate > previous ? rate / previous : previous / rate
  return ratio <= MAX_RATE_DRIFT
}
