import { MAPS_KEY, isMapsConfigured } from '@/lib/maps/loader'
import type { LatLng } from '@/utils/geo'

import { decodePolyline, samePoint } from './polyline'
import type { Route, RouteStep, RouteTravelMode } from './types'

/**
 * Google Routes API (`computeRoutes`).
 *
 * Preferred over the legacy Directions service because it returns
 * traffic-aware durations for driving and per-step navigation instructions for
 * both driving and walking.
 */
const ENDPOINT = 'https://routes.googleapis.com/directions/v2:computeRoutes'

/** Keep the field mask tight — it is what Google bills and returns. */
const FIELD_MASK = [
  'routes.duration',
  'routes.staticDuration',
  'routes.distanceMeters',
  'routes.polyline.encodedPolyline',
  'routes.legs.steps.distanceMeters',
  'routes.legs.steps.staticDuration',
  'routes.legs.steps.navigationInstruction',
  'routes.legs.steps.polyline.encodedPolyline',
].join(',')

const REQUEST_TIMEOUT_MS = 12_000

export class RoutesApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly reason: string | null = null,
  ) {
    super(message)
    this.name = 'RoutesApiError'
  }
}

interface RawNavigationInstruction {
  maneuver?: string
  instructions?: string
}

interface RawStep {
  distanceMeters?: number
  staticDuration?: string
  navigationInstruction?: RawNavigationInstruction
  polyline?: { encodedPolyline?: string }
}

interface RawRoute {
  duration?: string
  staticDuration?: string
  distanceMeters?: number
  polyline?: { encodedPolyline?: string }
  legs?: { steps?: RawStep[] }[]
}

interface RawResponse {
  routes?: RawRoute[]
  error?: { code?: number; message?: string; status?: string }
}

/** `"143s"` → `143`. */
function parseSeconds(value: string | undefined): number {
  if (!value) return 0
  const match = /^([\d.]+)s?$/.exec(value.trim())
  return match ? Math.round(Number(match[1])) : 0
}

function buildGeometry(rawSteps: RawStep[]): {
  steps: RouteStep[]
  path: LatLng[]
} {
  const path: LatLng[] = []
  const steps: RouteStep[] = []

  for (const raw of rawSteps) {
    const geometry = decodePolyline(raw.polyline?.encodedPolyline ?? '')
    if (geometry.length === 0) continue

    // Steps share their boundary vertex — drop the duplicate.
    const last = path[path.length - 1]
    const points =
      last && samePoint(last, geometry[0]) ? geometry.slice(1) : geometry

    const startIndex = Math.max(0, path.length - 1)
    path.push(...points)

    steps.push({
      instruction:
        raw.navigationInstruction?.instructions?.trim() || 'Continue',
      maneuver: raw.navigationInstruction?.maneuver ?? '',
      distanceMeters: Math.round(raw.distanceMeters ?? 0),
      durationSeconds: parseSeconds(raw.staticDuration),
      startIndex,
      endIndex: Math.max(0, path.length - 1),
    })
  }

  return { steps, path }
}

export interface ComputeRouteOptions {
  /** Traffic model for driving. Ignored for walking. */
  trafficAware?: boolean
  signal?: AbortSignal
}

/** Whether a Routes API request can be attempted at all. */
export function isRoutesApiConfigured(): boolean {
  return isMapsConfigured()
}

export async function computeRoute(
  origin: LatLng,
  destination: LatLng,
  mode: RouteTravelMode,
  options: ComputeRouteOptions = {},
): Promise<Route> {
  const key = MAPS_KEY
  if (!key || !key.trim()) {
    throw new RoutesApiError('Google Maps API key is not configured', 0)
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  const onAbort = () => controller.abort()
  options.signal?.addEventListener('abort', onAbort)

  // Traffic awareness is a driving-only concept.
  const trafficAware = mode === 'drive' && options.trafficAware !== false

  const body: Record<string, unknown> = {
    origin: {
      location: { latLng: { latitude: origin.lat, longitude: origin.lng } },
    },
    destination: {
      location: {
        latLng: { latitude: destination.lat, longitude: destination.lng },
      },
    },
    travelMode: mode === 'drive' ? 'DRIVE' : 'WALK',
    languageCode: 'en-CA',
    units: 'METRIC',
    polylineQuality: 'HIGH_QUALITY',
    polylineEncoding: 'ENCODED_POLYLINE',
    computeAlternativeRoutes: false,
  }

  if (trafficAware) body.routingPreference = 'TRAFFIC_AWARE'

  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': FIELD_MASK,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    const payload = (await response.json().catch(() => null)) as RawResponse | null

    if (!response.ok) {
      throw new RoutesApiError(
        payload?.error?.message ?? `Routes request failed (${response.status})`,
        response.status,
        payload?.error?.status ?? null,
      )
    }

    const route = payload?.routes?.[0]
    if (!route) {
      throw new RoutesApiError('No route found', response.status)
    }

    const rawSteps = (route.legs ?? []).flatMap((leg) => leg.steps ?? [])
    const { steps, path } = buildGeometry(rawSteps)

    const fallbackPath =
      path.length >= 2
        ? path
        : decodePolyline(route.polyline?.encodedPolyline ?? '')

    const geometry =
      fallbackPath.length >= 2 ? fallbackPath : [origin, destination]

    const durationSeconds = parseSeconds(route.duration)
    const staticDurationSeconds = route.staticDuration
      ? parseSeconds(route.staticDuration)
      : null

    return {
      origin,
      destination,
      distanceMeters: Math.round(
        route.distanceMeters ?? pathLength(geometry),
      ),
      durationSeconds: durationSeconds || staticDurationSeconds || 0,
      staticDurationSeconds,
      trafficAware:
        trafficAware &&
        staticDurationSeconds !== null &&
        durationSeconds > 0,
      path: geometry,
      steps,
      source: 'routes-api',
      computedAt: Date.now(),
    }
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', onAbort)
  }
}

/** Local length so this module does not depend on the geometry helpers. */
function pathLength(path: LatLng[]): number {
  let total = 0
  for (let index = 1; index < path.length; index += 1) {
    const a = path[index - 1]
    const b = path[index]
    const dLat = (b.lat - a.lat) * 110_540
    const dLng = (b.lng - a.lng) * 111_320 * Math.cos((a.lat * Math.PI) / 180)
    total += Math.hypot(dLat, dLng)
  }
  return total
}
