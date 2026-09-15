import { isMapsConfigured, loadMaps } from '@/lib/maps/loader'
import { haversineKm, walkingMinutes, type LatLng } from '@/utils/geo'

import { directionsRoute } from './directions'
import { computeRoute, isRoutesApiConfigured } from './routesApi'
import type { Route } from './types'

/**
 * Walking routing between a parking space and the driver's destination.
 *
 * Layered like driving: Routes API → legacy Directions/DistanceMatrix → a
 * straight-line estimate that is always labelled as an estimate and never
 * presented as an exact walking route.
 */
export type WalkSource = 'route' | 'estimate'

export interface WalkingRoute {
  distanceMeters: number
  durationSeconds: number
  /** Decoded path for drawing the route. Only present for exact routes. */
  path: LatLng[] | null
  source: WalkSource
  /** Per-step walking instructions, when the provider supplied them. */
  steps?: { instruction: string; distanceMeters: number }[]
}

export interface WalkingLeg {
  distanceMeters: number
  durationSeconds: number
  source: WalkSource
}

const CACHE_TTL_MS = 10 * 60_000
const MAX_MATRIX_ORIGINS = 25

/** Straight-line fallback, inflated by a street-grid factor. */
const STREET_FACTOR = 1.25

const routeCache = new Map<string, { at: number; value: Route }>()
const legCache = new Map<string, { at: number; value: WalkingRoute }>()
const inFlight = new Map<string, Promise<Route>>()

function coordKey(point: LatLng): string {
  return `${point.lat.toFixed(5)},${point.lng.toFixed(5)}`
}

function routeKey(origin: LatLng, destination: LatLng): string {
  return `${coordKey(origin)};${coordKey(destination)}`
}

/** Drop cached routes — call when the destination changes. */
export function clearWalkingCache(): void {
  routeCache.clear()
  legCache.clear()
}

function estimateWalkRoute(origin: LatLng, destination: LatLng): Route {
  const km = haversineKm(origin, destination) * STREET_FACTOR
  return {
    origin,
    destination,
    distanceMeters: Math.round(km * 1000),
    durationSeconds: walkingMinutes(km) * 60,
    staticDurationSeconds: null,
    trafficAware: false,
    path: [origin, destination],
    steps: [],
    source: 'estimate',
    computedAt: Date.now(),
  }
}

function cachedRoute(key: string): Route | null {
  const hit = routeCache.get(key)
  if (!hit) return null
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    routeCache.delete(key)
    return null
  }
  return hit.value
}

function cachedLeg(key: string): WalkingRoute | null {
  const hit = legCache.get(key)
  if (!hit) return null
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    legCache.delete(key)
    return null
  }
  return hit.value
}

/** Exact walking route with step instructions, cached and de-duplicated. */
export async function getWalkRoute(
  origin: LatLng,
  destination: LatLng,
): Promise<Route> {
  const key = routeKey(origin, destination)

  const hit = cachedRoute(key)
  if (hit) return hit

  const pending = inFlight.get(key)
  if (pending) return pending

  const promise = (async (): Promise<Route> => {
    // 1. Routes API — real pedestrian routing plus step instructions.
    if (isRoutesApiConfigured()) {
      try {
        const route = await computeRoute(origin, destination, 'walk')
        if (route.durationSeconds > 0 && route.distanceMeters > 0) {
          routeCache.set(key, { at: Date.now(), value: route })
          return route
        }
      } catch {
        // Fall through.
      }
    }

    // 2. Legacy Directions service.
    const fallback = await directionsRoute(origin, destination, 'walk', false)
    if (fallback && fallback.durationSeconds > 0) {
      routeCache.set(key, { at: Date.now(), value: fallback })
      return fallback
    }

    // 3. Labelled estimate.
    return estimateWalkRoute(origin, destination)
  })()

  inFlight.set(key, promise)

  try {
    return await promise
  } finally {
    inFlight.delete(key)
  }
}

function toWalkingRoute(route: Route): WalkingRoute {
  return {
    distanceMeters: route.distanceMeters,
    durationSeconds: route.durationSeconds,
    path: route.path.length >= 2 ? route.path : null,
    source: route.source === 'estimate' ? 'estimate' : 'route',
    steps: route.steps.map((step) => ({
      instruction: step.instruction,
      distanceMeters: step.distanceMeters,
    })),
  }
}

/** Summary-only walking route, used by cards and badges. */
export async function getWalkingRoute(
  origin: LatLng,
  destination: LatLng,
): Promise<WalkingRoute> {
  const key = routeKey(origin, destination)

  const hit = cachedLeg(key)
  if (hit) return hit

  const value = toWalkingRoute(await getWalkRoute(origin, destination))
  legCache.set(key, { at: Date.now(), value })
  return value
}

/**
 * Walking legs from many origins to one destination in a single request.
 * Used by the search comparison list so we never fire one call per parking
 * marker. Results are cached individually.
 */
export async function getWalkingRoutes(
  origins: LatLng[],
  destination: LatLng,
): Promise<WalkingLeg[]> {
  const results: WalkingLeg[] = origins.map(() => ({
    distanceMeters: 0,
    durationSeconds: 0,
    source: 'estimate' as WalkSource,
  }))

  if (origins.length === 0) return results

  const missing: number[] = []
  origins.forEach((origin, index) => {
    const hit = cachedLeg(routeKey(origin, destination))
    if (hit) {
      results[index] = {
        distanceMeters: hit.distanceMeters,
        durationSeconds: hit.durationSeconds,
        source: hit.source,
      }
    } else {
      missing.push(index)
    }
  })

  if (missing.length === 0) return results

  const batch = missing.slice(0, MAX_MATRIX_ORIGINS)

  const applyEstimate = (indexes: number[]) => {
    indexes.forEach((index) => {
      const value = estimateWalkRoute(origins[index], destination)
      results[index] = {
        distanceMeters: value.distanceMeters,
        durationSeconds: value.durationSeconds,
        source: 'estimate',
      }
    })
  }

  if (!isMapsConfigured()) {
    applyEstimate(batch)
    return results
  }

  try {
    const maps = await loadMaps()
    const service = new maps.DistanceMatrixService()

    const response = await new Promise<google.maps.DistanceMatrixResponse>(
      (resolve, reject) => {
        service.getDistanceMatrix(
          {
            origins: batch.map((index) => origins[index]),
            destinations: [destination],
            travelMode: maps.TravelMode.WALKING,
          },
          (result, status) => {
            if (status === maps.DistanceMatrixStatus.OK && result) resolve(result)
            else reject(new Error(String(status)))
          },
        )
      },
    )

    const fallback: number[] = []
    batch.forEach((originIndex, rowIndex) => {
      const element = response.rows?.[rowIndex]?.elements?.[0]
      if (element?.status === 'OK' && element.distance && element.duration) {
        const value: WalkingRoute = {
          distanceMeters: element.distance.value,
          durationSeconds: element.duration.value,
          path: null,
          source: 'route',
        }
        legCache.set(routeKey(origins[originIndex], destination), {
          at: Date.now(),
          value,
        })
        results[originIndex] = {
          distanceMeters: value.distanceMeters,
          durationSeconds: value.durationSeconds,
          source: 'route',
        }
      } else {
        fallback.push(originIndex)
      }
    })

    applyEstimate(fallback)
  } catch {
    applyEstimate(batch)
  }

  return results
}
