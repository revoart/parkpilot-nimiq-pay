import { haversineKm, type LatLng } from '@/utils/geo'

import type { Route, RouteStep } from './types'

const METERS_PER_DEG_LAT = 110_540

function metersPerDegLng(lat: number): number {
  return 111_320 * Math.cos((lat * Math.PI) / 180)
}

interface LocalPoint {
  x: number
  y: number
}

/** Flat-earth projection around a reference point — accurate over city blocks. */
function toLocal(point: LatLng, reference: LatLng): LocalPoint {
  return {
    x: (point.lng - reference.lng) * metersPerDegLng(reference.lat),
    y: (point.lat - reference.lat) * METERS_PER_DEG_LAT,
  }
}

export function segmentLengthMeters(a: LatLng, b: LatLng): number {
  return haversineKm(a, b) * 1000
}

/** Running distance from the start of the path to each vertex, in metres. */
export function cumulativeDistances(path: LatLng[]): number[] {
  const out: number[] = path.length > 0 ? [0] : []
  for (let index = 1; index < path.length; index += 1) {
    out.push(out[index - 1] + segmentLengthMeters(path[index - 1], path[index]))
  }
  return out
}

export function pathLengthMeters(path: LatLng[]): number {
  const cumulative = cumulativeDistances(path)
  return cumulative[cumulative.length - 1] ?? 0
}

export interface PathProjection {
  /** Index of the segment (`path[i]` → `path[i + 1]`) nearest the point. */
  segmentIndex: number
  /** Distance from the path start to the projected point, in metres. */
  distanceAlong: number
  /** Perpendicular distance from the route, in metres. */
  offRouteMeters: number
  /** 0–1 progress along the whole path. */
  fraction: number
}

/**
 * Snap a position onto a route: where along the route the driver is, and how
 * far they have drifted from it. This drives both progress and off-course
 * detection, so it never allocates a second route.
 */
export function projectOntoPath(
  path: LatLng[],
  point: LatLng,
  cumulative?: number[],
): PathProjection | null {
  if (path.length === 0) return null

  if (path.length === 1) {
    return {
      segmentIndex: 0,
      distanceAlong: 0,
      offRouteMeters: segmentLengthMeters(path[0], point),
      fraction: 0,
    }
  }

  const dist = cumulative ?? cumulativeDistances(path)
  const reference = path[0]
  const projected = toLocal(point, reference)

  let best: PathProjection | null = null

  for (let index = 0; index < path.length - 1; index += 1) {
    const a = toLocal(path[index], reference)
    const b = toLocal(path[index + 1], reference)
    const dx = b.x - a.x
    const dy = b.y - a.y
    const lengthSq = dx * dx + dy * dy

    let t = 0
    if (lengthSq > 0) {
      t = ((projected.x - a.x) * dx + (projected.y - a.y) * dy) / lengthSq
      t = Math.min(1, Math.max(0, t))
    }

    const offRoute = Math.hypot(
      projected.x - (a.x + t * dx),
      projected.y - (a.y + t * dy),
    )

    if (!best || offRoute < best.offRouteMeters) {
      best = {
        segmentIndex: index,
        distanceAlong: dist[index] + t * (dist[index + 1] - dist[index]),
        offRouteMeters: offRoute,
        fraction: 0,
      }
    }
  }

  if (!best) return null
  const total = dist[dist.length - 1]
  best.fraction = total > 0 ? best.distanceAlong / total : 0
  return best
}

/** Interpolate the coordinate `distance` metres along a path. */
export function pointAtDistance(
  path: LatLng[],
  distance: number,
  cumulative?: number[],
): LatLng | null {
  if (path.length === 0) return null
  if (path.length === 1) return path[0]

  const dist = cumulative ?? cumulativeDistances(path)
  const total = dist[dist.length - 1]
  const target = Math.min(Math.max(distance, 0), total)

  for (let index = 0; index < path.length - 1; index += 1) {
    if (target > dist[index + 1]) continue
    const span = dist[index + 1] - dist[index]
    const t = span > 0 ? (target - dist[index]) / span : 0
    const a = path[index]
    const b = path[index + 1]
    return {
      lat: a.lat + (b.lat - a.lat) * t,
      lng: a.lng + (b.lng - a.lng) * t,
    }
  }

  return path[path.length - 1]
}

export function remainingDistanceMeters(
  cumulative: number[],
  distanceAlong: number,
): number {
  const total = cumulative[cumulative.length - 1] ?? 0
  return Math.max(0, total - distanceAlong)
}

/** Which step the driver is currently on, given progress along the route. */
export function activeStepIndex(
  steps: RouteStep[],
  cumulative: number[],
  distanceAlong: number,
): number {
  if (steps.length === 0) return -1
  for (let index = 0; index < steps.length; index += 1) {
    const end = cumulative[steps[index].endIndex] ?? 0
    if (distanceAlong < end) return index
  }
  return steps.length - 1
}

/** Metres remaining until the end of the given step. */
export function distanceToStepEnd(
  steps: RouteStep[],
  cumulative: number[],
  stepIndex: number,
  distanceAlong: number,
): number {
  const step = steps[stepIndex]
  if (!step) return 0
  return Math.max(0, (cumulative[step.endIndex] ?? 0) - distanceAlong)
}

/** Compass bearing in degrees (0 = north), for map rotation. */
export function bearingDegrees(from: LatLng, to: LatLng): number {
  const toRad = (value: number) => (value * Math.PI) / 180
  const toDeg = (value: number) => (value * 180) / Math.PI

  const deltaLng = toRad(to.lng - from.lng)
  const lat1 = toRad(from.lat)
  const lat2 = toRad(to.lat)

  const y = Math.sin(deltaLng) * Math.cos(lat2)
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng)

  return (toDeg(Math.atan2(y, x)) + 360) % 360
}

export interface RouteProgress {
  /** Metres travelled along the route. */
  distanceAlong: number
  /** Metres left to the end of the route. */
  remainingMeters: number
  /** Perpendicular distance from the route. */
  offRouteMeters: number
  /** 0–1 completion. */
  fraction: number
  /** Index of the current step, or -1 when the route has no steps. */
  stepIndex: number
  /** The current step, if any. */
  step: RouteStep | null
  /** Metres until the end of the current step. */
  metersToStepEnd: number
  /** The step after the current one, if any. */
  nextStep: RouteStep | null
}

/** Full navigation progress for a position along a route. */
export function routeProgress(
  route: Route,
  cumulative: number[],
  position: LatLng,
): RouteProgress | null {
  const projection = projectOntoPath(route.path, position, cumulative)
  if (!projection) return null

  const stepIndex = activeStepIndex(
    route.steps,
    cumulative,
    projection.distanceAlong,
  )

  return {
    distanceAlong: projection.distanceAlong,
    remainingMeters: remainingDistanceMeters(cumulative, projection.distanceAlong),
    offRouteMeters: projection.offRouteMeters,
    fraction: projection.fraction,
    stepIndex,
    step: stepIndex >= 0 ? route.steps[stepIndex] : null,
    metersToStepEnd:
      stepIndex >= 0
        ? distanceToStepEnd(
            route.steps,
            cumulative,
            stepIndex,
            projection.distanceAlong,
          )
        : 0,
    nextStep: stepIndex >= 0 ? (route.steps[stepIndex + 1] ?? null) : null,
  }
}
