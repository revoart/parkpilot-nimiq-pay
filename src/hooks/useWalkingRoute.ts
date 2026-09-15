import { useEffect, useState } from 'react'

import { getWalkingRoute, type WalkingRoute } from '@/lib/routing'
import type { LatLng } from '@/utils/geo'

interface UseWalkingRouteResult {
  route: WalkingRoute | null
  loading: boolean
}

function keyOf(point: LatLng | null): string {
  return point ? `${point.lat.toFixed(5)},${point.lng.toFixed(5)}` : ''
}

/**
 * Resolves the walking route between a parking space and the destination.
 * Cached and de-duplicated in `lib/routing`, so re-renders never re-request.
 */
export function useWalkingRoute(
  origin: LatLng | null,
  destination: LatLng | null,
): UseWalkingRouteResult {
  const [route, setRoute] = useState<WalkingRoute | null>(null)
  const [loading, setLoading] = useState(false)

  const originKey = keyOf(origin)
  const destinationKey = keyOf(destination)

  useEffect(() => {
    if (!origin || !destination) {
      setRoute(null)
      setLoading(false)
      return
    }

    let active = true
    setLoading(true)

    getWalkingRoute(origin, destination)
      .then((value) => {
        if (active) setRoute(value)
      })
      .catch(() => {
        if (active) setRoute(null)
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
    // Coordinates are the identity here — re-run only when they change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [originKey, destinationKey])

  return { route, loading }
}
