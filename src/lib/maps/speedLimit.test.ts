import { describe, expect, it } from 'vitest'

import { cellKey, parseMaxspeed } from './speedLimit'

describe('parseMaxspeed', () => {
  it('reads a bare number as km/h', () => {
    expect(parseMaxspeed('50')).toEqual({ limit: 50, units: 'km/h' })
  })

  it('reads explicit km/h forms', () => {
    expect(parseMaxspeed('50 km/h')).toEqual({ limit: 50, units: 'km/h' })
    expect(parseMaxspeed('50kmh')).toEqual({ limit: 50, units: 'km/h' })
    expect(parseMaxspeed('50 kph')).toEqual({ limit: 50, units: 'km/h' })
  })

  it('reads mph forms without converting', () => {
    expect(parseMaxspeed('30 mph')).toEqual({ limit: 30, units: 'mph' })
  })

  it('handles walk and knots', () => {
    expect(parseMaxspeed('walk')).toEqual({ limit: 5, units: 'km/h' })
    expect(parseMaxspeed('10 knots')).toEqual({ limit: 19, units: 'km/h' })
  })

  it('is case and whitespace insensitive', () => {
    expect(parseMaxspeed('  50 KM/H  ')).toEqual({ limit: 50, units: 'km/h' })
  })

  it('returns null for unlimited or variable limits', () => {
    // Showing a number here would be actively wrong, so unknown is correct.
    expect(parseMaxspeed('none')).toBeNull()
    expect(parseMaxspeed('signals')).toBeNull()
    expect(parseMaxspeed('variable')).toBeNull()
  })

  it('returns null for unusable input', () => {
    expect(parseMaxspeed(undefined)).toBeNull()
    expect(parseMaxspeed(null)).toBeNull()
    expect(parseMaxspeed('')).toBeNull()
    expect(parseMaxspeed('urban')).toBeNull()
    expect(parseMaxspeed('0')).toBeNull()
    expect(parseMaxspeed('CA:urban')).toBeNull()
  })
})

describe('cellKey', () => {
  it('gives nearby points the same key', () => {
    // ~5 m apart: same cell, so one lookup covers both.
    expect(cellKey(43.6532, -79.3832)).toBe(cellKey(43.65324, -79.38321))
  })

  it('gives distant points different keys', () => {
    expect(cellKey(43.6532, -79.3832)).not.toBe(cellKey(43.66, -79.39))
  })
})
