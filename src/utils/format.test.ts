import { describe, expect, it } from 'vitest'

import { formatDistanceKm, formatUsdt, shortenAddress } from './format'

describe('shortenAddress', () => {
  it('shortens a full wallet address', () => {
    const address = '0xE4C5d04f359316f6AEa754F7ed7Edc0b38d0083F'
    expect(shortenAddress(address)).toBe('0xE4C5…083F')
  })

  it('leaves short values untouched', () => {
    expect(shortenAddress('0x1234')).toBe('0x1234')
  })

  it('honours a custom size', () => {
    const address = '0xE4C5d04f359316f6AEa754F7ed7Edc0b38d0083F'
    expect(shortenAddress(address, 6)).toBe('0xE4C5d0…d0083F')
  })
})

describe('formatUsdt', () => {
  it('formats to two decimals by default', () => {
    expect(formatUsdt(5)).toBe('5.00')
    expect(formatUsdt('99.9904')).toBe('99.99')
  })

  it('formats to the requested precision', () => {
    expect(formatUsdt('99.9904', 4)).toBe('99.9904')
  })

  it('falls back to zero for unparseable input', () => {
    expect(formatUsdt('abc')).toBe('0.00')
    expect(formatUsdt(Number.NaN)).toBe('0.00')
    expect(formatUsdt(Number.POSITIVE_INFINITY)).toBe('0.00')
  })

  it('handles zero and negatives', () => {
    expect(formatUsdt(0)).toBe('0.00')
    expect(formatUsdt(-2.5)).toBe('-2.50')
  })
})

describe('formatDistanceKm', () => {
  it('uses metres below one kilometre', () => {
    expect(formatDistanceKm(0.25)).toBe('250 m')
    expect(formatDistanceKm(0.999)).toBe('999 m')
  })

  it('uses kilometres at and above one kilometre', () => {
    expect(formatDistanceKm(1)).toBe('1.0 km')
    expect(formatDistanceKm(2.34)).toBe('2.3 km')
    expect(formatDistanceKm(12)).toBe('12.0 km')
  })

  it('handles zero', () => {
    expect(formatDistanceKm(0)).toBe('0 m')
  })
})
