import { describe, expect, it } from 'vitest'

import { formatPhone, normalizePhone, telHref } from './phone'

describe('normalizePhone', () => {
  it('keeps an international number with its plus', () => {
    expect(normalizePhone('+1 416 555 1234')).toBe('+14165551234')
    expect(normalizePhone('+44 (0)20 7946 0958')).toBe('+4402079460958')
  })

  it('strips formatting characters', () => {
    expect(normalizePhone('(416) 555-1234')).toBe('4165551234')
    expect(normalizePhone('416.555.1234')).toBe('4165551234')
    expect(normalizePhone('  416 555 1234  ')).toBe('4165551234')
  })

  it('keeps a national number as typed, without inventing a country code', () => {
    // Guessing a country would silently point calls at the wrong subscriber.
    expect(normalizePhone('020 7946 0958')).toBe('02079460958')
  })

  it('rejects too few or too many digits', () => {
    expect(normalizePhone('1234567')).toBeNull()
    expect(normalizePhone('1234567890123456')).toBeNull()
  })

  it('accepts the shortest and longest valid lengths', () => {
    expect(normalizePhone('12345678')).toBe('12345678')
    expect(normalizePhone('123456789012345')).toBe('123456789012345')
  })

  it('rejects empty, blank and non-string input', () => {
    expect(normalizePhone('')).toBeNull()
    expect(normalizePhone('   ')).toBeNull()
    expect(normalizePhone(null)).toBeNull()
    expect(normalizePhone(undefined)).toBeNull()
  })

  it('rejects input with no digits at all', () => {
    expect(normalizePhone('not a phone')).toBeNull()
    expect(normalizePhone('+')).toBeNull()
  })

  it('ignores a plus that is not leading', () => {
    expect(normalizePhone('416+5551234')).toBe('4165551234')
  })
})

describe('telHref', () => {
  it('builds a dialable href from a stored number', () => {
    expect(telHref('+14165551234')).toBe('tel:+14165551234')
    expect(telHref('4165551234')).toBe('tel:4165551234')
  })

  it('normalises before building, so raw input never reaches the href', () => {
    expect(telHref('+1 (416) 555-1234')).toBe('tel:+14165551234')
  })

  it('cannot carry anything but digits and a leading plus', () => {
    // The whole point: nothing a user typed can end up in the URL, so a stored
    // value can never turn the link into a script or a second scheme.
    const href = telHref('+1 416 555 1234; javascript:alert(1)')
    expect(href).toMatch(/^tel:\+?[0-9]+$/)
    expect(href).not.toContain('javascript')
    expect(href).not.toContain('alert')
    // Exactly one colon: the scheme separator. Nothing else survived.
    expect(href?.split(':')).toHaveLength(2)
  })

  it('rejects a value that is only long enough because of injected digits', () => {
    // Stripping non-digits can push a hostile string past the length limit,
    // which must fail closed rather than produce a truncated number.
    expect(telHref('+1 416 555 1234 javascript:99999999')).toBeNull()
  })

  it('returns null when there is no usable number', () => {
    expect(telHref(null)).toBeNull()
    expect(telHref('')).toBeNull()
    expect(telHref('123')).toBeNull()
  })
})

describe('formatPhone', () => {
  it('groups North American numbers 3-3-4', () => {
    expect(formatPhone('+14165551234')).toBe('+1 416 555 1234')
  })

  it('groups a bare 10-digit number the same way', () => {
    expect(formatPhone('4165551234')).toBe('416 555 1234')
  })

  it('groups other lengths in threes', () => {
    expect(formatPhone('+442079460958')).toBe('+442 079 460 958')
  })

  it('returns null when there is no usable number', () => {
    expect(formatPhone(null)).toBeNull()
    expect(formatPhone('nonsense')).toBeNull()
  })
})
