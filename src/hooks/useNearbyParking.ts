import { useCallback, useEffect, useState } from 'react'

import { listNearbyParking, NEARBY_RADIUS_M } from '@/lib/parking'
import type { NearbyParkingSpace } from '@/types'
import type { LatLng } from '@/utils/geo'

export interface UseNearbyParkingResult {
  spaces: NearbyParkingSpace[]
  loading: boolean
  error: string | null
  /** True once a query has run for a real centre. */
  ready: boolean
  reload: () => void
}

function centerKey(center: LatLng | null): string {
  // ~11 m of precision: enough to react to real movement without refetching on
  // every GPS jitter.
  return center ? `${center.lat.toFixed(4)},${center.lng.toFixed(4)}` : ''
}

/**
 * Real parking within a radius of a point, measured by the database.
 *
 * Returns an empty list when nothing is in range — it never substitutes
 * sample listings, so callers can show an honest empty state.
 */
export function useNearbyParking(
  center: LatLng | null,
  radiusMeters: number = NEARBY_RADIUS_M,
): UseNearbyParkingResult {
  const [spaces, setSpaces] = useState<NearbyParkingSpace[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [nonce, setNonce] = useState(0)

  const reload = useCallback(() => setNonce((value) => value + 1), [])
  const key = centerKey(center)

  useEffect(() => {
    if (!center) {
      setSpaces([])
      setLoading(false)
      setReady(false)
      setError(null)
      return
    }

    let active = true
    setLoading(true)
    setError(null)

    listNearbyParking(center, radiusMeters)
      .then((result) => {
        if (!active) return
        setSpaces(result)
        setReady(true)
      })
      .catch((err: unknown) => {
        if (!active) return
        setSpaces([])
        setError(
          err instanceof Error ? err.message : 'Parking could not be loaded.',
        )
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
    // Coordinates are the identity here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, radiusMeters, nonce])

  return { spaces, loading, error, ready, reload }
}
