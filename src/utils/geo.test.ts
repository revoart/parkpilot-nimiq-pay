import { describe, expect, it } from 'vitest'

import { TORONTO_CENTER, haversineKm, walkingMinutes } from './geo'

describe('haversineKm', () => {
  it('returns zero for the same point', () => {
    expect(haversineKm(TORONTO_CENTER, TORONTO_CENTER)).toBe(0)
  })

  it('is symmetric', () => {
    const a = { lat: 43.6532, lng: -79.3832 }
    const b = { lat: 43.7, lng: -79.4 }
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 10)
  })

  it('matches a known distance', () => {
    // Toronto -> Montreal is roughly 505 km.
    const montreal = { lat: 45.5019, lng: -73.5674 }
    expect(haversineKm(TORONTO_CENTER, montreal)).toBeGreaterThan(480)
    expect(haversineKm(TORONTO_CENTER, montreal)).toBeLessThan(520)
  })

  it('measures a short city distance accurately', () => {
    // ~0.9 km north of the Toronto centre.
    const nearby = { lat: 43.6612, lng: -79.3832 }
    const km = haversineKm(TORONTO_CENTER, nearby)
    expect(km).toBeGreaterThan(0.85)
    expect(km).toBeLessThan(0.95)
  })

  it('handles antipodal points without NaN', () => {
    const km = haversineKm({ lat: 0, lng: 0 }, { lat: 0, lng: 180 })
    expect(Number.isNaN(km)).toBe(false)
    expect(km).toBeCloseTo(20015, 0)
  })
})

describe('walkingMinutes', () => {
  it('assumes roughly 4.8 km/h', () => {
    expect(walkingMinutes(4.8)).toBe(60)
    expect(walkingMinutes(2.4)).toBe(30)
  })

  it('never reports less than a minute', () => {
    expect(walkingMinutes(0)).toBe(1)
    expect(walkingMinutes(0.001)).toBe(1)
  })

  it('rounds to the nearest minute', () => {
    expect(walkingMinutes(1)).toBe(13)
  })
})
