import type { LatLng } from '@/utils/geo'

/** Driving and walking are the only two legs ParkPilot routes. */
export type RouteTravelMode = 'drive' | 'walk'

/** A leg of a journey. Both navigation modes use the same two. */
export type NavigationLeg = 'drive' | 'walk'

/**
 * Which kind of journey is being navigated.
 *
 * `parking` drives to a parking space and then walks to the destination;
 * `general` drives straight to the destination. Only the wording of the arrival
 * announcement differs — the routing and guidance are identical.
 */
export type NavigationMode = 'parking' | 'general'

/** The end of the leg being navigated. */
export function legTarget(
  leg: NavigationLeg,
  driveTarget: LatLng | null,
  walkTo: LatLng | null,
): LatLng | null {
  return leg === 'drive' ? driveTarget : walkTo
}

/**
 * What to say on arrival. Only a parking journey's driving leg ends at a
 * parking space — every other arrival is the driver's actual destination.
 */
export function arrivalPhrase(
  mode: NavigationMode,
  leg: NavigationLeg,
): string {
  const arrivesAtParking = mode === 'parking' && leg === 'drive'
  return arrivesAtParking
    ? 'You have arrived at your parking destination.'
    : 'You have arrived at your destination.'
}

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
