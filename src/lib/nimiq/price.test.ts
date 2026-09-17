import { describe, expect, it } from 'vitest'

import {
  MAX_EQUIVALENT_AGE_MS,
  formatUsdAmount,
  isRateFresh,
  usdtValueOfLuna,
  usdtValueOfNim,
} from './price'

/** A realistic rate: NIM trades around a fraction of a cent. */
const RATE = 0.00038

describe('usdtValueOfNim', () => {
  it('converts a realistic listing price', () => {
    // 5,000 NIM is about two dollars, which is the whole reason this exists.
    expect(usdtValueOfNim('5000', RATE)).toBeCloseTo(1.9, 6)
    expect(usdtValueOfNim(5000, RATE)).toBeCloseTo(1.9, 6)
  })

  it('converts small amounts', () => {
    expect(usdtValueOfNim('1', RATE)).toBeCloseTo(0.00038, 9)
    expect(usdtValueOfNim('1000', RATE)).toBeCloseTo(0.38, 6)
  })

  it('is zero for missing or non-positive amounts', () => {
    expect(usdtValueOfNim(null, RATE)).toBe(0)
    expect(usdtValueOfNim(undefined, RATE)).toBe(0)
    expect(usdtValueOfNim('0', RATE)).toBe(0)
    expect(usdtValueOfNim('-5', RATE)).toBe(0)
    expect(usdtValueOfNim('nonsense', RATE)).toBe(0)
  })

  it('is zero when the rate is unusable', () => {
    expect(usdtValueOfNim('5000', 0)).toBe(0)
    expect(usdtValueOfNim('5000', -1)).toBe(0)
    expect(usdtValueOfNim('5000', Number.NaN)).toBe(0)
    expect(usdtValueOfNim('5000', Infinity)).toBe(0)
  })
})

describe('usdtValueOfLuna', () => {
  it('converts Luna, where 1 NIM is 100,000 Luna', () => {
    expect(usdtValueOfLuna(500_000_000n, RATE)).toBeCloseTo(1.9, 6)
    expect(usdtValueOfLuna(100_000n, RATE)).toBeCloseTo(0.00038, 9)
  })

  it('agrees with the NIM path', () => {
    expect(usdtValueOfLuna(100_000n, RATE)).toBeCloseTo(usdtValueOfNim('1', RATE), 12)
  })

  it('is zero for non-positive Luna or an unusable rate', () => {
    expect(usdtValueOfLuna(0n, RATE)).toBe(0)
    expect(usdtValueOfLuna(-1n, RATE)).toBe(0)
    expect(usdtValueOfLuna(100_000n, 0)).toBe(0)
  })
})

describe('formatUsdAmount', () => {
  it('uses two decimals for normal amounts', () => {
    expect(formatUsdAmount(1.9)).toBe('1.90')
    expect(formatUsdAmount(0.19)).toBe('0.19')
    expect(formatUsdAmount(12)).toBe('12.00')
  })

  it('reports sub-cent amounts as "<0.01" rather than "0.00"', () => {
    // Rounding to 0.00 would read as free, which it is not.
    expect(formatUsdAmount(0.001)).toBe('<0.01')
    expect(formatUsdAmount(0.009)).toBe('<0.01')
  })

  it('is "0.00" only for genuinely zero or invalid input', () => {
    expect(formatUsdAmount(0)).toBe('0.00')
    expect(formatUsdAmount(-1)).toBe('0.00')
    expect(formatUsdAmount(Number.NaN)).toBe('0.00')
  })
})

describe('isRateFresh', () => {
  const now = Date.parse('2026-09-16T12:00:00.000Z')

  it('accepts a recent rate', () => {
    const fetched = new Date(now - 60_000).toISOString()
    expect(isRateFresh(fetched, now)).toBe(true)
  })

  it('rejects a rate past the display window', () => {
    const fetched = new Date(now - MAX_EQUIVALENT_AGE_MS - 1).toISOString()
    expect(isRateFresh(fetched, now)).toBe(false)
  })

  it('rejects a missing or malformed timestamp', () => {
    expect(isRateFresh(null, now)).toBe(false)
    expect(isRateFresh('', now)).toBe(false)
    expect(isRateFresh('not-a-date', now)).toBe(false)
  })

  it('hides the equivalent after a quarter of an hour', () => {
    expect(MAX_EQUIVALENT_AGE_MS).toBe(15 * 60_000)
  })
})
