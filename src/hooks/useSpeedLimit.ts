import { useEffect, useRef, useState } from 'react'

import {
  type SpeedLimit,
  cellKey,
  fetchSpeedLimit,
} from '@/lib/maps/speedLimit'

/**
 * The posted speed limit for the road the driver is currently on.
 *
 * Only re-queries when the driver moves to a new cache cell, so a whole block
 * of driving costs a single Overpass request. Returns null when OSM has no
 * data — callers must treat that as "unknown" and hide the badge rather than
 * showing a guess.
 */
export function useSpeedLimit(
  position: { lat: number; lng: number } | null | undefined,
): SpeedLimit | null {
  const [limit, setLimit] = useState<SpeedLimit | null>(null)
  const lastKey = useRef<string | null>(null)

  const lat = position?.lat ?? null
  const lng = position?.lng ?? null

  useEffect(() => {
    if (lat === null || lng === null) {
      lastKey.current = null
      setLimit(null)
      return
    }

    const key = cellKey(lat, lng)
    if (key === lastKey.current) return
    lastKey.current = key

    let cancelled = false
    void fetchSpeedLimit(lat, lng).then((value) => {
      if (!cancelled) setLimit(value)
    })

    return () => {
      cancelled = true
    }
  }, [lat, lng])

  return limit
}
