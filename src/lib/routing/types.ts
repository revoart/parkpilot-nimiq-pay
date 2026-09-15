import type { LatLng } from '@/utils/geo'

/** Driving and walking are the only two legs ParkPilot routes. */
export type RouteTravelMode = 'drive' | 'walk'

/**
 * Where a route came from. Surfaced in the UI so a straight-line estimate is
 * never presented as an exact routed distance.
 */
export type RouteSource = 'routes-api' | 'directions' | 'estimate'

export interface RouteStep {
  /** Human instruction, e.g. "Turn right onto King St W". */
  instruction: string
  /** Provider maneuver, e.g. `TURN_RIGHT`, `DEPART`, `ARRIVE`. */
  maneuver: string
  distanceMeters: number
  durationSeconds: number
  /** Index into `Route.path` where this step starts. */
  startIndex: number
  /** Index into `Route.path` where this step ends (inclusive). */
  endIndex: number
}

export interface Route {
  origin: LatLng
  destination: LatLng
  distanceMeters: number
  durationSeconds: number
  /** Duration with traffic ignored, when the provider supplies it. */
  staticDurationSeconds: number | null
  /** True when `durationSeconds` came from a live traffic model. */
  trafficAware: boolean
  /** Decoded geometry — always at least `[origin, destination]`. */
  path: LatLng[]
  steps: RouteStep[]
  source: RouteSource
  /** Epoch ms the route was computed, used for staleness checks. */
  computedAt: number
}

export function isExactRoute(route: Route | null): boolean {
  return route !== null && route.source !== 'estimate'
}
