import { isMapsConfigured, loadMaps } from '@/lib/maps/loader'
import { haversineKm, walkingMinutes, type LatLng } from '@/utils/geo'

/**
 * Walking routing between a parking space and the driver's destination.
 *
 * Uses the Google Maps JS API `DirectionsService` / `DistanceMatrixService`
 * (travel mode WALKING) so it keeps working under a referrer-restricted key.
 * A straight-line distance is only ever surfaced as a clearly-labelled
 * *estimate* — it is never presented as an exact walking route.
 */
export type WalkSource = 'route' | 'estimate'

export interface WalkingRoute {
  distanceMeters: number
  durationSeconds: number
  /** Decoded path for drawing the route. Only present for exact routes. */
  path: LatLng[] | null
  source: WalkSource
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

const cache = new Map<string, { at: number; value: WalkingRoute }>()
const inFlight = new Map<string, Promise<WalkingRoute>>()

function coordKey(point: LatLng): string {
  return `${point.lat.toFixed(5)},${point.lng.toFixed(5)}`
}

function routeKey(origin: LatLng, destination: LatLng): string {
  return `${coordKey(origin)};${coordKey(destination)}`
}

/** Drop cached routes — call when the destination changes. */
export function clearWalkingCache(): void {
  cache.clear()
}

function estimateRoute(origin: LatLng, destination: LatLng): WalkingRoute {
  const km = haversineKm(origin, destination) * STREET_FACTOR
  return {
    distanceMeters: Math.round(km * 1000),
    durationSeconds: walkingMinutes(km) * 60,
    path: null,
    source: 'estimate',
  }
}

function cached(key: string): WalkingRoute | null {
  const hit = cache.get(key)
  if (!hit) return null
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key)
    return null
  }
  return hit.value
}

function store(key: string, value: WalkingRoute): void {
  cache.set(key, { at: Date.now(), value })
}

/** Exact walking route between two points, cached and de-duplicated. */
export async function getWalkingRoute(
  origin: LatLng,
  destination: LatLng,
): Promise<WalkingRoute> {
  const key = routeKey(origin, destination)

  const hit = cached(key)
  if (hit) return hit

  const pending = inFlight.get(key)
  if (pending) return pending

  const promise = (async (): Promise<WalkingRoute> => {
    if (!isMapsConfigured()) return estimateRoute(origin, destination)

    try {
      const maps = await loadMaps()
      const service = new maps.DirectionsService()

      const result = await new Promise<google.maps.DirectionsResult>(
        (resolve, reject) => {
          service.route(
            {
              origin,
              destination,
              travelMode: maps.TravelMode.WALKING,
            },
            (response, status) => {
              if (status === maps.DirectionsStatus.OK && response) resolve(response)
              else reject(new Error(String(status)))
            },
          )
        },
      )

      const leg = result.routes?.[0]?.legs?.[0]
      if (!leg?.distance || !leg.duration) {
        return estimateRoute(origin, destination)
      }

      const path = (leg.steps ?? [])
        .flatMap((step) => step.path ?? [])
        .map((point) => ({ lat: point.lat(), lng: point.lng() }))

      const value: WalkingRoute = {
        distanceMeters: leg.distance.value,
        durationSeconds: leg.duration.value,
        path: path.length > 0 ? path : null,
        source: 'route',
      }
      store(key, value)
      return value
    } catch {
      return estimateRoute(origin, destination)
    } finally {
      inFlight.delete(key)
    }
  })()

  inFlight.set(key, promise)
  return promise
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
    const hit = cached(routeKey(origin, destination))
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
      const value = estimateRoute(origins[index], destination)
      results[index] = {
        distanceMeters: value.distanceMeters,
        durationSeconds: value.durationSeconds,
        source: value.source,
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
        store(routeKey(origins[originIndex], destination), value)
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
