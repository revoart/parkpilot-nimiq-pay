import { describe, expect, it } from 'vitest'

import {
  LUNA_PER_NIM,
  NIM_DECIMALS,
  isPositiveLuna,
  lunaToNim,
  lunaToNumber,
  nimToLuna,
} from './amounts'

describe('nimToLuna', () => {
  it('converts whole NIM', () => {
    expect(nimToLuna('1')).toBe(100_000n)
    expect(nimToLuna('5')).toBe(500_000n)
    expect(nimToLuna(2)).toBe(200_000n)
    expect(nimToLuna(3n)).toBe(300_000n)
    expect(nimToLuna('0')).toBe(0n)
  })

  it('converts fractional NIM exactly', () => {
    expect(nimToLuna('1.5')).toBe(150_000n)
    expect(nimToLuna('0.01')).toBe(1_000n)
    expect(nimToLuna('0.00001')).toBe(1n)
    expect(nimToLuna('123.45678')).toBe(12_345_678n)
  })

  it('avoids binary floating-point drift', () => {
    // 0.1 * 100000 in floats is 10000.000000000002, which would round wrong
    // once amounts grow. Integer arithmetic must be exact.
    expect(nimToLuna('0.1')).toBe(10_000n)
    expect(nimToLuna('0.3')).toBe(30_000n)
    expect(nimToLuna('0.07')).toBe(7_000n)
    expect(nimToLuna('8.29')).toBe(829_000n)
  })

  it('tolerates surrounding whitespace', () => {
    expect(nimToLuna('  1.25  ')).toBe(125_000n)
  })

  it('rejects precision finer than one Luna instead of truncating', () => {
    expect(() => nimToLuna('0.000001')).toThrow(/smaller than one Luna/)
    expect(() => nimToLuna('1.123456')).toThrow(/smaller than one Luna/)
  })

  it('allows trailing zeros beyond the Luna precision', () => {
    expect(nimToLuna('1.500000')).toBe(150_000n)
    expect(nimToLuna('0.010000000')).toBe(1_000n)
  })

  it('rejects malformed and negative input', () => {
    expect(() => nimToLuna('abc')).toThrow(/Invalid NIM amount/)
    expect(() => nimToLuna('')).toThrow(/Invalid NIM amount/)
    expect(() => nimToLuna('1.2.3')).toThrow(/Invalid NIM amount/)
    expect(() => nimToLuna('-1')).toThrow(/Invalid NIM amount/)
    expect(() => nimToLuna('1e3')).toThrow(/Invalid NIM amount/)
  })
})

describe('lunaToNim', () => {
  it('converts whole NIM without a trailing decimal', () => {
    expect(lunaToNim(100_000n)).toBe('1')
    expect(lunaToNim(500_000n)).toBe('5')
    expect(lunaToNim(0n)).toBe('0')
  })

  it('pads and trims the fractional part', () => {
    expect(lunaToNim(1n)).toBe('0.00001')
    expect(lunaToNim(10n)).toBe('0.0001')
    expect(lunaToNim(150_000n)).toBe('1.5')
    expect(lunaToNim(12_345_678n)).toBe('123.45678')
  })

  it('accepts numbers as well as bigints', () => {
    expect(lunaToNim(150_000)).toBe('1.5')
  })

  it('handles negatives', () => {
    expect(lunaToNim(-150_000n)).toBe('-1.5')
  })

  it('round-trips through nimToLuna', () => {
    for (const amount of ['0', '1', '0.00001', '1.5', '123.45678', '99999.99999']) {
      expect(lunaToNim(nimToLuna(amount))).toBe(amount)
    }
  })
})

describe('lunaToNumber', () => {
  it('narrows values the provider can accept', () => {
    expect(lunaToNumber(150_000n)).toBe(150_000)
    expect(lunaToNumber(0n)).toBe(0)
  })

  it('handles the entire NIM supply, which fits below 2^53', () => {
    const totalSupplyLuna = nimToLuna('21000000000')
    expect(lunaToNumber(totalSupplyLuna)).toBe(2_100_000_000_000_000)
    expect(Number.isSafeInteger(lunaToNumber(totalSupplyLuna))).toBe(true)
  })

  it('throws rather than rounding an out-of-range amount', () => {
    expect(() => lunaToNumber(BigInt(Number.MAX_SAFE_INTEGER) + 1n)).toThrow(
      /safe integer range/,
    )
    expect(() => lunaToNumber(-(BigInt(Number.MAX_SAFE_INTEGER) + 1n))).toThrow(
      /safe integer range/,
    )
  })
})

describe('constants and guards', () => {
  it('uses Nimiq’s five-decimal scale', () => {
    expect(LUNA_PER_NIM).toBe(100_000n)
    expect(NIM_DECIMALS).toBe(5)
  })

  it('identifies positive amounts', () => {
    expect(isPositiveLuna(1n)).toBe(true)
    expect(isPositiveLuna(0n)).toBe(false)
    expect(isPositiveLuna(-1n)).toBe(false)
  })
})
