import { haversineKm, type LatLng } from '@/utils/geo'

import { directionsRoute } from './directions'
import { computeRoute, isRoutesApiConfigured } from './routesApi'
import type { Route } from './types'

/**
 * Driving routes for ParkPilot.
 *
 * Three layers, best first:
 *   1. Routes API   — traffic-aware duration + turn-by-turn instructions
 *   2. Directions   — legacy JS service, still traffic aware when supported
 *   3. Estimate     — straight line, clearly labelled, never shown as exact
 *
 * The caller always receives a route, so the UI never has to handle a hard
 * failure for something as basic as "how long is the drive".
 */

/** Routes cache lives briefly — traffic moves. */
const CACHE_TTL_MS = 90_000

/** Straight-line fallback, inflated by a street-grid factor. */
const STREET_FACTOR = 1.3

/** Conservative downtown average speed for the estimate fallback. */
const ESTIMATED_KMH = 26

const cache = new Map<string, { at: number; value: Route }>()
const inFlight = new Map<string, Promise<Route>>()

/** ~11 m of precision is plenty for cache identity. */
function coordKey(point: LatLng): string {
  return `${point.lat.toFixed(4)},${point.lng.toFixed(4)}`
}

function routeKey(origin: LatLng, destination: LatLng): string {
  return `${coordKey(origin)};${coordKey(destination)}`
}

export function clearDrivingCache(): void {
  cache.clear()
}

function cached(key: string): Route | null {
  const hit = cache.get(key)
  if (!hit) return null
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key)
    return null
  }
  return hit.value
}

function store(key: string, value: Route): void {
  cache.set(key, { at: Date.now(), value })
}

export function estimateDrivingRoute(
  origin: LatLng,
  destination: LatLng,
): Route {
  const km = haversineKm(origin, destination) * STREET_FACTOR
  return {
    origin,
    destination,
    distanceMeters: Math.round(km * 1000),
    durationSeconds: Math.max(60, Math.round((km / ESTIMATED_KMH) * 3600)),
    staticDurationSeconds: null,
    trafficAware: false,
    path: [origin, destination],
    steps: [],
    source: 'estimate',
    computedAt: Date.now(),
  }
}

export interface DrivingRouteOptions {
  /** Bypass the cache (used on manual refresh and reroutes). */
  force?: boolean
  /** Set false for a free-flow duration instead of a live one. */
  trafficAware?: boolean
  signal?: AbortSignal
}

export async function getDrivingRoute(
  origin: LatLng,
  destination: LatLng,
  options: DrivingRouteOptions = {},
): Promise<Route> {
  const key = routeKey(origin, destination)

  if (!options.force) {
    const hit = cached(key)
    if (hit) return hit
  }

  const pending = inFlight.get(key)
  if (pending && !options.force) return pending

  const trafficAware = options.trafficAware !== false

  const promise = (async (): Promise<Route> => {
    if (isRoutesApiConfigured()) {
      try {
        const route = await computeRoute(origin, destination, 'drive', {
          trafficAware,
          signal: options.signal,
        })
        if (route.durationSeconds > 0) {
          store(key, route)
          return route
        }
      } catch {
        // Fall through to the legacy service.
      }
    }

    const fallback = await directionsRoute(
      origin,
      destination,
      'drive',
      trafficAware,
    )
    if (fallback && fallback.durationSeconds > 0) {
      store(key, fallback)
      return fallback
    }

    return estimateDrivingRoute(origin, destination)
  })()

  inFlight.set(key, promise)

  try {
    return await promise
  } finally {
    inFlight.delete(key)
  }
}
