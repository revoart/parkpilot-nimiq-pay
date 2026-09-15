import { useCallback, useEffect, useState } from 'react'

import { getDrivingRoute, type Route } from '@/lib/routing'
import type { LatLng } from '@/utils/geo'

export interface UseDrivingRouteResult {
  route: Route | null
  loading: boolean
  error: string | null
  /** Recompute now, bypassing the cache (manual refresh / reroute). */
  refresh: () => void
}

function keyOf(point: LatLng | null): string {
  return point ? `${point.lat.toFixed(4)},${point.lng.toFixed(4)}` : ''
}

/**
 * Driving route between the driver and the parking space.
 *
 * The origin is the live position, so the key is rounded to ~11 m — this keeps
 * the hook from refetching on every GPS jitter while still reacting to real
 * movement.
 */
export function useDrivingRoute(
  origin: LatLng | null,
  destination: LatLng | null,
  options: { enabled?: boolean } = {},
): UseDrivingRouteResult {
  const enabled = options.enabled !== false
  const [route, setRoute] = useState<Route | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  const originKey = keyOf(origin)
  const destinationKey = keyOf(destination)

  const refresh = useCallback(() => setNonce((value) => value + 1), [])

  useEffect(() => {
    if (!enabled || !origin || !destination) {
      setRoute(null)
      setLoading(false)
      return
    }

    let active = true
    setLoading(true)
    setError(null)

    getDrivingRoute(origin, destination, { force: nonce > 0 })
      .then((value) => {
        if (active) setRoute(value)
      })
      .catch((err: unknown) => {
        if (active) {
          setError(err instanceof Error ? err.message : 'Route unavailable')
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
    // Coordinates are the identity here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [originKey, destinationKey, enabled, nonce])

  return { route, loading, error, refresh }
}
