import { describe, expect, it } from 'vitest'

import {
  bearingBetween,
  distanceMeters,
  easeAngleToward,
  easeToward,
  headingChangedEnough,
  metersPerPixel,
  normalizeAngle,
  offsetAlongHeading,
  shortestArc,
  smoothHeading,
} from './camera'

describe('shortestArc', () => {
  it('takes the short way round the compass', () => {
    expect(shortestArc(350, 10)).toBeCloseTo(20, 6)
    expect(shortestArc(10, 350)).toBeCloseTo(-20, 6)
    expect(shortestArc(0, 90)).toBeCloseTo(90, 6)
    expect(shortestArc(90, 0)).toBeCloseTo(-90, 6)
  })

  it('is zero for no movement', () => {
    expect(shortestArc(123, 123)).toBe(0)
  })

  it('never exceeds half a turn', () => {
    for (const from of [0, 45, 180, 270, 359]) {
      for (const to of [0, 45, 180, 270, 359]) {
        const delta = shortestArc(from, to)
        expect(Math.abs(delta)).toBeLessThanOrEqual(180)
      }
    }
  })
})

describe('normalizeAngle', () => {
  it('wraps negatives and overflow into [0, 360)', () => {
    expect(normalizeAngle(-90)).toBe(270)
    expect(normalizeAngle(-360)).toBe(0)
    expect(normalizeAngle(450)).toBe(90)
    expect(normalizeAngle(360)).toBe(0)
  })
})

describe('easeToward', () => {
  it('moves toward the target without overshooting', () => {
    const next = easeToward(0, 100, 100, 300)
    expect(next).toBeGreaterThan(0)
    expect(next).toBeLessThan(100)
  })

  it('is frame-rate independent', () => {
    // One 32ms step and two 16ms steps must land in the same place.
    const single = easeToward(0, 100, 32, 300)
    const double = easeToward(easeToward(0, 100, 16, 300), 100, 16, 300)
    expect(double).toBeCloseTo(single, 6)
  })

  it('snaps to the target with a zero time constant', () => {
    expect(easeToward(0, 100, 16, 0)).toBe(100)
  })

  it('holds still with no elapsed time', () => {
    expect(easeToward(25, 100, 0, 300)).toBe(25)
  })
})

describe('easeAngleToward', () => {
  it('crosses north the short way', () => {
    // 350 -> 10 is a 20 degree turn to the right, through north, so the first
    // step lands between 350 and 360 rather than sweeping back through 180.
    const next = easeAngleToward(350, 10, 100, 300)
    expect(next).toBeGreaterThan(350)
    expect(next).toBeLessThan(360)
  })

  it('settles on a target across north', () => {
    let value = 350
    for (let i = 0; i < 400; i++) value = easeAngleToward(value, 10, 16, 200)
    expect(value).toBeCloseTo(10, 3)
  })

  it('stays inside [0, 360)', () => {
    let value = 350
    for (let i = 0; i < 200; i++) {
      value = easeAngleToward(value, 10, 16, 200)
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(360)
    }
  })

  it('converges on the target', () => {
    let value = 0
    for (let i = 0; i < 400; i++) value = easeAngleToward(value, 90, 16, 200)
    expect(value).toBeCloseTo(90, 3)
  })
})

describe('smoothHeading', () => {
  it('accepts the first sample unchanged', () => {
    expect(smoothHeading(null, 123)).toBe(123)
  })

  it('follows the short way across north', () => {
    // A quarter of the 20 degree turn: 350 -> 355, i.e. heading for north
    // rather than sweeping backwards through 180.
    expect(smoothHeading(350, 10, 0.25)).toBeCloseTo(355, 6)
  })

  it('wraps to 0 when a step lands exactly on north', () => {
    expect(smoothHeading(350, 10, 0.5)).toBe(0)
  })

  it('damps a single noisy sample', () => {
    // A 20° spike should not be taken at face value.
    const next = smoothHeading(100, 120, 0.35)
    expect(next).toBeGreaterThan(100)
    expect(next).toBeLessThan(120)
  })

  it('ignores a non-finite previous value', () => {
    expect(smoothHeading(Number.NaN, 45)).toBe(45)
  })

  it('clamps alpha into 0..1', () => {
    expect(smoothHeading(0, 90, 5)).toBe(90)
    expect(smoothHeading(0, 90, -1)).toBe(0)
  })
})

describe('headingChangedEnough', () => {
  it('always accepts the first heading', () => {
    expect(headingChangedEnough(null, 42)).toBe(true)
  })

  it('rejects sub-threshold churn', () => {
    expect(headingChangedEnough(100, 100.2, 0.5)).toBe(false)
  })

  it('accepts a real change, including across north', () => {
    expect(headingChangedEnough(100, 103, 0.5)).toBe(true)
    expect(headingChangedEnough(359, 1, 0.5)).toBe(true)
  })
})

describe('distanceMeters', () => {
  it('is zero for the same point', () => {
    expect(distanceMeters({ lat: 43.65, lng: -79.38 }, { lat: 43.65, lng: -79.38 })).toBe(0)
  })

  it('measures a known short hop', () => {
    // ~1.11 km per 0.01 degrees of latitude.
    const d = distanceMeters({ lat: 43.65, lng: -79.38 }, { lat: 43.66, lng: -79.38 })
    expect(d).toBeGreaterThan(1090)
    expect(d).toBeLessThan(1130)
  })

  it('is symmetric', () => {
    const a = { lat: 43.65, lng: -79.38 }
    const b = { lat: 43.67, lng: -79.4 }
    expect(distanceMeters(a, b)).toBeCloseTo(distanceMeters(b, a), 6)
  })
})

describe('bearingBetween', () => {
  const origin = { lat: 43.6532, lng: -79.3832 }

  it('reports due north', () => {
    expect(bearingBetween(origin, { lat: 43.66, lng: -79.3832 })).toBeCloseTo(0, 1)
  })

  it('reports due east', () => {
    expect(bearingBetween(origin, { lat: 43.6532, lng: -79.37 })).toBeCloseTo(90, 1)
  })

  it('reports due south', () => {
    expect(bearingBetween(origin, { lat: 43.64, lng: -79.3832 })).toBeCloseTo(180, 1)
  })

  it('reports due west', () => {
    expect(bearingBetween(origin, { lat: 43.6532, lng: -79.4 })).toBeCloseTo(270, 1)
  })

  it('always returns a value in [0, 360)', () => {
    for (const to of [
      { lat: 44, lng: -80 },
      { lat: 43, lng: -79 },
      { lat: 43.6532, lng: -79.3832 },
    ]) {
      const bearing = bearingBetween(origin, to)
      expect(bearing).toBeGreaterThanOrEqual(0)
      expect(bearing).toBeLessThan(360)
    }
  })
})

describe('metersPerPixel', () => {
  it('halves for each zoom level', () => {
    const atTen = metersPerPixel(43.6532, 10)
    const atEleven = metersPerPixel(43.6532, 11)
    expect(atEleven).toBeCloseTo(atTen / 2, 6)
  })

  it('shrinks as latitude increases away from the equator', () => {
    expect(metersPerPixel(60, 15)).toBeLessThan(metersPerPixel(0, 15))
  })
})

describe('offsetAlongHeading', () => {
  const start = { lat: 43.6532, lng: -79.3832 }

  it('moves north when heading north', () => {
    const next = offsetAlongHeading(start, 0, 1, 100)
    expect(next.lat).toBeGreaterThan(start.lat)
    expect(next.lng).toBeCloseTo(start.lng, 9)
  })

  it('moves east when heading east', () => {
    const next = offsetAlongHeading(start, 90, 1, 100)
    expect(next.lng).toBeGreaterThan(start.lng)
    expect(next.lat).toBeCloseTo(start.lat, 9)
  })

  it('is a no-op with no pixels', () => {
    const next = offsetAlongHeading(start, 45, 1, 0)
    expect(next.lat).toBeCloseTo(start.lat, 12)
    expect(next.lng).toBeCloseTo(start.lng, 12)
  })

  it('scales with the requested distance', () => {
    const near = offsetAlongHeading(start, 0, 1, 50)
    const far = offsetAlongHeading(start, 0, 1, 200)
    expect(far.lat - start.lat).toBeCloseTo((near.lat - start.lat) * 4, 9)
  })
})
