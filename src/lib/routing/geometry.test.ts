import { describe, expect, it } from 'vitest'

import type { LatLng } from '@/utils/geo'

import {
  activeStepIndex,
  bearingDegrees,
  cumulativeDistances,
  distanceToStepEnd,
  pathLengthMeters,
  pointAtDistance,
  projectOntoPath,
  remainingDistanceMeters,
  routeProgress,
  segmentLengthMeters,
} from './geometry'
import type { Route } from './types'

/** Three points on one latitude line — roughly 805 m per leg. */
const A: LatLng = { lat: 43.65, lng: -79.4 }
const B: LatLng = { lat: 43.65, lng: -79.39 }
const C: LatLng = { lat: 43.65, lng: -79.38 }
const PATH = [A, B, C]

const LEG_METERS = segmentLengthMeters(A, B)

describe('cumulativeDistances / pathLengthMeters', () => {
  it('starts at zero and increases monotonically', () => {
    const cumulative = cumulativeDistances(PATH)
    expect(cumulative[0]).toBe(0)
    expect(cumulative).toHaveLength(3)
    expect(cumulative[1]).toBeGreaterThan(0)
    expect(cumulative[2]).toBeGreaterThan(cumulative[1])
  })

  it('measures each leg at roughly 800 m', () => {
    expect(LEG_METERS).toBeGreaterThan(780)
    expect(LEG_METERS).toBeLessThan(830)
  })

  it('reports the whole path length', () => {
    expect(pathLengthMeters(PATH)).toBeCloseTo(LEG_METERS * 2, -1)
  })

  it('handles degenerate paths', () => {
    expect(pathLengthMeters([])).toBe(0)
    expect(pathLengthMeters([A])).toBe(0)
  })
})

describe('projectOntoPath', () => {
  it('finds a point sitting on the path with no offset', () => {
    const projection = projectOntoPath(PATH, B)
    expect(projection).not.toBeNull()
    expect(projection?.offRouteMeters).toBeLessThan(1)
    expect(projection?.distanceAlong).toBeCloseTo(LEG_METERS, -1)
    expect(projection?.fraction).toBeCloseTo(0.5, 1)
  })

  it('measures perpendicular distance off the path', () => {
    // ~50 m north of the midpoint.
    const north = { lat: B.lat + 0.00045, lng: B.lng }
    const projection = projectOntoPath(PATH, north)
    expect(projection?.offRouteMeters).toBeGreaterThan(40)
    expect(projection?.offRouteMeters).toBeLessThan(60)
  })

  it('clamps to the start of the path', () => {
    // The path runs east, so west of A is "before the start".
    const westOfStart = { lat: A.lat, lng: A.lng - 0.02 }
    const projection = projectOntoPath(PATH, westOfStart)
    expect(projection?.distanceAlong).toBe(0)
    expect(projection?.fraction).toBe(0)
  })

  it('clamps to the end of the path', () => {
    const eastOfEnd = { lat: C.lat, lng: C.lng + 0.02 }
    const projection = projectOntoPath(PATH, eastOfEnd)
    expect(projection?.fraction).toBe(1)
  })

  it('returns null for an empty path', () => {
    expect(projectOntoPath([], A)).toBeNull()
  })

  it('handles a single-point path', () => {
    const projection = projectOntoPath([A], A)
    expect(projection?.offRouteMeters).toBe(0)
    expect(projection?.distanceAlong).toBe(0)
  })
})

describe('pointAtDistance', () => {
  it('returns the start at zero distance', () => {
    const point = pointAtDistance(PATH, 0)
    expect(point?.lat).toBeCloseTo(A.lat, 5)
    expect(point?.lng).toBeCloseTo(A.lng, 5)
  })

  it('interpolates the midpoint', () => {
    const point = pointAtDistance(PATH, LEG_METERS)
    expect(point?.lat).toBeCloseTo(B.lat, 4)
    expect(point?.lng).toBeCloseTo(B.lng, 4)
  })

  it('clamps beyond the end', () => {
    const point = pointAtDistance(PATH, LEG_METERS * 10)
    expect(point?.lng).toBeCloseTo(C.lng, 4)
  })

  it('returns null for an empty path', () => {
    expect(pointAtDistance([], 100)).toBeNull()
  })
})

describe('remainingDistanceMeters', () => {
  it('subtracts progress from the total', () => {
    const cumulative = cumulativeDistances(PATH)
    expect(remainingDistanceMeters(cumulative, 0)).toBeCloseTo(LEG_METERS * 2, -1)
    expect(remainingDistanceMeters(cumulative, LEG_METERS * 2)).toBe(0)
  })

  it('never goes negative', () => {
    const cumulative = cumulativeDistances(PATH)
    expect(remainingDistanceMeters(cumulative, LEG_METERS * 5)).toBe(0)
  })
})

const ROUTE: Route = {
  origin: A,
  destination: C,
  distanceMeters: Math.round(LEG_METERS * 2),
  durationSeconds: 300,
  staticDurationSeconds: 300,
  trafficAware: false,
  path: PATH,
  steps: [
    {
      instruction: 'Head east on Queen St',
      maneuver: 'DEPART',
      distanceMeters: Math.round(LEG_METERS),
      durationSeconds: 150,
      startIndex: 0,
      endIndex: 1,
    },
    {
      instruction: 'You have arrived',
      maneuver: 'ARRIVE',
      distanceMeters: Math.round(LEG_METERS),
      durationSeconds: 150,
      startIndex: 1,
      endIndex: 2,
    },
  ],
  source: 'routes-api',
  computedAt: Date.now(),
}

const CUMULATIVE = cumulativeDistances(PATH)

describe('activeStepIndex', () => {
  it('selects the step containing the progress', () => {
    expect(activeStepIndex(ROUTE.steps, CUMULATIVE, 100)).toBe(0)
    expect(activeStepIndex(ROUTE.steps, CUMULATIVE, LEG_METERS + 100)).toBe(1)
  })

  it('returns the last step at the very end', () => {
    expect(activeStepIndex(ROUTE.steps, CUMULATIVE, LEG_METERS * 2)).toBe(1)
  })

  it('returns -1 when there are no steps', () => {
    expect(activeStepIndex([], CUMULATIVE, 100)).toBe(-1)
  })
})

describe('distanceToStepEnd', () => {
  it('measures to the end of the current step', () => {
    expect(distanceToStepEnd(ROUTE.steps, CUMULATIVE, 0, 0)).toBeCloseTo(
      LEG_METERS,
      -1,
    )
    expect(
      distanceToStepEnd(ROUTE.steps, CUMULATIVE, 0, LEG_METERS / 2),
    ).toBeCloseTo(LEG_METERS / 2, -1)
  })

  it('never goes negative', () => {
    expect(distanceToStepEnd(ROUTE.steps, CUMULATIVE, 0, LEG_METERS * 3)).toBe(0)
  })
})

describe('routeProgress', () => {
  it('reports progress, the current step and the remaining distance', () => {
    // A quarter of the way along the first leg.
    const position = { lat: A.lat, lng: A.lng + 0.005 }
    const progress = routeProgress(ROUTE, CUMULATIVE, position)

    expect(progress).not.toBeNull()
    expect(progress?.offRouteMeters).toBeLessThan(1)
    expect(progress?.fraction).toBeCloseTo(0.25, 1)
    expect(progress?.stepIndex).toBe(0)
    expect(progress?.step?.maneuver).toBe('DEPART')
    // A quarter of the way along the first leg leaves ~600 m of it.
    expect(progress?.metersToStepEnd).toBeGreaterThan(350)
    expect(progress?.metersToStepEnd).toBeLessThan(450)
    expect(progress?.remainingMeters).toBeGreaterThan(1000)
    expect(progress?.nextStep?.maneuver).toBe('ARRIVE')
  })

  it('moves to the second step past the first boundary', () => {
    const position = { lat: B.lat, lng: B.lng + 0.005 }
    const progress = routeProgress(ROUTE, CUMULATIVE, position)
    expect(progress?.stepIndex).toBe(1)
    expect(progress?.nextStep).toBeNull()
  })

  it('reports near-zero remaining at the destination', () => {
    const progress = routeProgress(ROUTE, CUMULATIVE, C)
    expect(progress?.remainingMeters).toBeLessThan(1)
    expect(progress?.fraction).toBeCloseTo(1, 2)
  })

  it('detects a large deviation as off-route', () => {
    const farAway = { lat: A.lat + 0.01, lng: A.lng }
    const progress = routeProgress(ROUTE, CUMULATIVE, farAway)
    expect(progress?.offRouteMeters).toBeGreaterThan(100)
  })

  it('returns null for an empty path', () => {
    expect(routeProgress({ ...ROUTE, path: [] }, [], A)).toBeNull()
  })
})

describe('bearingDegrees', () => {
  const origin = { lat: 0, lng: 0 }

  it('reports north as 0', () => {
    expect(bearingDegrees(origin, { lat: 1, lng: 0 })).toBeCloseTo(0, 1)
  })

  it('reports east as 90', () => {
    expect(bearingDegrees(origin, { lat: 0, lng: 1 })).toBeCloseTo(90, 1)
  })

  it('reports south as 180', () => {
    expect(bearingDegrees(origin, { lat: -1, lng: 0 })).toBeCloseTo(180, 1)
  })

  it('reports west as 270', () => {
    expect(bearingDegrees(origin, { lat: 0, lng: -1 })).toBeCloseTo(270, 1)
  })
})
