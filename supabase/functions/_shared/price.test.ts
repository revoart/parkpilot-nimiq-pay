import { describe, expect, it } from 'vitest'

import {
  MAX_RATE_DRIFT,
  NIM_PRICE_TTL_MS,
  VENUES,
  isPlausibleRate,
  medianRate,
} from './price'

const venue = (name: string) => {
  const found = VENUES.find((entry) => entry.name === name)
  if (!found) throw new Error(`No venue named ${name}`)
  return found
}

describe('venue parsers', () => {
  it('reads MEXC', () => {
    // Verbatim shape from api.mexc.com.
    expect(venue('mexc').parse({ symbol: 'NIMUSDT', price: '0.000369' })).toBe(
      0.000369,
    )
  })

  it('reads Gate from its array response', () => {
    // Verbatim shape from api.gateio.ws (trimmed).
    expect(
      venue('gate').parse([
        {
          currency_pair: 'NIM_USDT',
          last: '0.0003822',
          lowest_ask: '0.0003829',
          highest_bid: '0.0003823',
        },
      ]),
    ).toBe(0.0003822)
  })

  it('reads KuCoin', () => {
    // Verbatim shape from api.kucoin.com (trimmed).
    expect(
      venue('kucoin').parse({
        code: '200000',
        data: { time: 1789594072982, price: '0.000385', size: '523632.0001' },
      }),
    ).toBe(0.000385)
  })

  it('rejects malformed payloads instead of throwing', () => {
    for (const entry of VENUES) {
      expect(entry.parse(null)).toBeNull()
      expect(entry.parse(undefined)).toBeNull()
      expect(entry.parse({})).toBeNull()
      expect(entry.parse([])).toBeNull()
      expect(entry.parse('nonsense')).toBeNull()
    }
  })

  it('rejects zero, negative and non-numeric prices', () => {
    expect(venue('mexc').parse({ price: '0' })).toBeNull()
    expect(venue('mexc').parse({ price: '0.00' })).toBeNull()
    expect(venue('mexc').parse({ price: '-1' })).toBeNull()
    expect(venue('mexc').parse({ price: 'abc' })).toBeNull()
    expect(venue('mexc').parse({ price: null })).toBeNull()
    expect(venue('kucoin').parse({ data: { price: '' } })).toBeNull()
  })

  it('polls three independent venues', () => {
    expect(VENUES.map((entry) => entry.name).sort()).toEqual([
      'gate',
      'kucoin',
      'mexc',
    ])
  })
})

describe('medianRate', () => {
  it('takes the middle of three readings', () => {
    expect(medianRate([0.000369, 0.0003822, 0.000385])).toBeCloseTo(0.0003822, 10)
  })

  it('ignores an outlier above, which is the whole point of using three venues', () => {
    // The bogus price is the largest value, so the median is the middle reading
    // and one broken venue cannot move the result.
    const withOutlier = [0.000369, 0.0003822, 0.9]
    expect(medianRate(withOutlier)).toBeCloseTo(0.0003822, 10)
    expect(medianRate(withOutlier)).toBeLessThan(0.001)
  })

  it('ignores an outlier below', () => {
    expect(medianRate([0.000369, 0.0003822, 0.0000001])).toBeCloseTo(0.000369, 10)
  })

  it('still reports the outlier when two venues agree on it', () => {
    // The median is not a sanity filter: if two of three venues say the price
    // moved, the median follows them. `isPlausibleRate` is the backstop.
    expect(medianRate([0.000369, 0.9, 0.9])).toBe(0.9)
  })

  it('averages the middle pair for an even count', () => {
    expect(medianRate([0.0002, 0.0004])).toBeCloseTo(0.0003, 10)
  })

  it('handles a single reading', () => {
    expect(medianRate([0.0004])).toBe(0.0004)
  })

  it('is null when nothing usable arrived', () => {
    expect(medianRate([])).toBeNull()
    expect(medianRate([0, -1, Number.NaN])).toBeNull()
  })

  it('ignores non-positive entries', () => {
    expect(medianRate([0.000369, 0, 0.000385])).toBeCloseTo(0.000377, 10)
  })
})

describe('isPlausibleRate', () => {
  it('accepts the first reading when nothing is cached', () => {
    expect(isPlausibleRate(0.0004, null)).toBe(true)
  })

  it('accepts ordinary movement', () => {
    expect(isPlausibleRate(0.0004, 0.00038)).toBe(true)
    expect(isPlausibleRate(0.00038, 0.0004)).toBe(true)
  })

  it('rejects a move beyond the drift ceiling in either direction', () => {
    const previous = 0.0004
    expect(isPlausibleRate(previous * (MAX_RATE_DRIFT + 1), previous)).toBe(false)
    expect(isPlausibleRate(previous / (MAX_RATE_DRIFT + 1), previous)).toBe(false)
  })

  it('catches a unit error such as quoting per-1000-NIM', () => {
    expect(isPlausibleRate(0.4, 0.0004)).toBe(false)
  })

  it('rejects invalid readings outright', () => {
    expect(isPlausibleRate(0, null)).toBe(false)
    expect(isPlausibleRate(-1, null)).toBe(false)
    expect(isPlausibleRate(Number.NaN, null)).toBe(false)
  })
})

describe('cache window', () => {
  it('is a minute', () => {
    expect(NIM_PRICE_TTL_MS).toBe(60_000)
  })
})
