import { isMapsConfigured, loadMaps } from '@/lib/maps/loader'
import type { LatLng } from '@/utils/geo'

import { samePoint } from './polyline'
import type { Route, RouteStep, RouteTravelMode } from './types'

/**
 * Legacy `DirectionsService` fallback.
 *
 * Used when the Routes API is unavailable (not enabled on the key, blocked by
 * a referrer restriction, or offline). It still gives real routed geometry and
 * traffic-aware durations for driving, just with less rich step data.
 */
const TAG = /<[^>]*>/g

export function stripHtml(value: string | undefined): string {
  if (!value) return ''
  return value
    .replace(TAG, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function toPath(points: google.maps.LatLng[] | undefined): LatLng[] {
  return (points ?? []).map((point) => ({ lat: point.lat(), lng: point.lng() }))
}

export async function directionsRoute(
  origin: LatLng,
  destination: LatLng,
  mode: RouteTravelMode,
  trafficAware: boolean,
): Promise<Route | null> {
  if (!isMapsConfigured()) return null

  try {
    const maps = await loadMaps()
    const service = new maps.DirectionsService()

    const request: google.maps.DirectionsRequest = {
      origin,
      destination,
      travelMode:
        mode === 'drive' ? maps.TravelMode.DRIVING : maps.TravelMode.WALKING,
    }

    // Traffic-aware durations are a driving-only option.
    if (mode === 'drive' && trafficAware) {
      request.drivingOptions = {
        departureTime: new Date(),
        trafficModel: maps.TrafficModel.BEST_GUESS,
      }
    }

    const result = await new Promise<google.maps.DirectionsResult>(
      (resolve, reject) => {
        service.route(request, (response, status) => {
          if (status === maps.DirectionsStatus.OK && response) resolve(response)
          else reject(new Error(String(status)))
        })
      },
    )

    const leg = result.routes?.[0]?.legs?.[0]
    if (!leg) return null

    const path: LatLng[] = []
    const steps: RouteStep[] = []

    for (const step of leg.steps ?? []) {
      const geometry = toPath(step.path)
      if (geometry.length === 0) continue

      const last = path[path.length - 1]
      const points =
        last && samePoint(last, geometry[0]) ? geometry.slice(1) : geometry

      const startIndex = Math.max(0, path.length - 1)
      path.push(...points)

      steps.push({
        instruction: stripHtml(step.instructions) || 'Continue',
        maneuver: step.maneuver ? String(step.maneuver) : '',
        distanceMeters: Math.round(step.distance?.value ?? 0),
        durationSeconds: Math.round(step.duration?.value ?? 0),
        startIndex,
        endIndex: Math.max(0, path.length - 1),
      })
    }

    const overview = toPath(result.routes?.[0]?.overview_path)
    const geometry =
      path.length >= 2
        ? path
        : overview.length >= 2
          ? overview
          : [origin, destination]

    const staticSeconds = leg.duration?.value ?? 0
    const trafficSeconds = leg.duration_in_traffic?.value
    const durationSeconds = trafficSeconds ?? staticSeconds

    return {
      origin,
      destination,
      distanceMeters: Math.round(leg.distance?.value ?? 0),
      durationSeconds: Math.round(durationSeconds),
      staticDurationSeconds: staticSeconds
        ? Math.round(staticSeconds)
        : null,
      trafficAware:
        mode === 'drive' && trafficAware && trafficSeconds !== undefined,
      path: geometry,
      steps,
      source: 'directions',
      computedAt: Date.now(),
    }
  } catch {
    return null
  }
}
