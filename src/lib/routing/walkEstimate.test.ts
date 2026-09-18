import { describe, expect, it } from 'vitest'

import {
  STREET_FACTOR,
  WALKING_METRES_PER_MINUTE,
  estimatedWalkMeters,
  estimatedWalkMinutes,
  straightLineMeters,
} from './walkEstimate'

const DOWNTOWN = { lat: 43.6532, lng: -79.3832 }

describe('straightLineMeters', () => {
  it('is zero for the same point', () => {
    expect(straightLineMeters(DOWNTOWN, DOWNTOWN)).toBe(0)
  })

  it('measures a known north-south distance', () => {
    // 0.009 degrees of latitude is very close to one kilometre.
    const north = { lat: 43.6622, lng: -79.3832 }
    expect(straightLineMeters(DOWNTOWN, north)).toBeGreaterThan(950)
    expect(straightLineMeters(DOWNTOWN, north)).toBeLessThan(1050)
  })

  it('is symmetric', () => {
    const other = { lat: 43.66, lng: -79.39 }
    expect(straightLineMeters(DOWNTOWN, other)).toBeCloseTo(
      straightLineMeters(other, DOWNTOWN),
      6,
    )
  })
})

describe('estimatedWalkMeters', () => {
  it('returns null when either end is missing', () => {
    expect(estimatedWalkMeters(null, DOWNTOWN)).toBeNull()
    expect(estimatedWalkMeters(DOWNTOWN, null)).toBeNull()
    expect(estimatedWalkMeters(undefined, undefined)).toBeNull()
  })

  it('returns null for non-finite coordinates', () => {
    expect(estimatedWalkMeters({ lat: NaN, lng: 0 }, DOWNTOWN)).toBeNull()
  })

  it('applies the street factor', () => {
    const north = { lat: 43.6622, lng: -79.3832 }
    const straight = straightLineMeters(DOWNTOWN, north)
    const walk = estimatedWalkMeters(DOWNTOWN, north)

    expect(walk).toBe(Math.round(straight * STREET_FACTOR))
    // Streets are not straight, so the walk is never shorter than the line.
    expect(walk).toBeGreaterThan(straight)
  })
})

describe('estimatedWalkMinutes', () => {
  it('never reports less than a minute', () => {
    // A space a few metres away is still a walk; "0 min" reads as a bug.
    expect(estimatedWalkMinutes(DOWNTOWN, DOWNTOWN)).toBe(1)
  })

  it('converts metres at the walking pace', () => {
    const north = { lat: 43.6622, lng: -79.3832 }
    const metres = estimatedWalkMeters(DOWNTOWN, north)!
    expect(estimatedWalkMinutes(DOWNTOWN, north)).toBe(
      Math.max(1, Math.round(metres / WALKING_METRES_PER_MINUTE)),
    )
  })

  it('returns null without a destination', () => {
    expect(estimatedWalkMinutes(DOWNTOWN, null)).toBeNull()
  })
})
