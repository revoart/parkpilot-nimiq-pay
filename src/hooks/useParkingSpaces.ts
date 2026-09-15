import { useCallback, useEffect, useState } from 'react'

import { listParkingSpaces } from '@/lib/parking'
import type { ParkingSpace } from '@/types'

interface UseParkingSpacesResult {
  spaces: ParkingSpace[]
  loading: boolean
  error: string | null
  reload: () => void
}

export function useParkingSpaces(search?: string): UseParkingSpacesResult {
  const [spaces, setSpaces] = useState<ParkingSpace[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  const reload = useCallback(() => setNonce((value) => value + 1), [])

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)

    listParkingSpaces(search)
      .then((result) => {
        if (!active) return
        setSpaces(result)
      })
      .catch((err: unknown) => {
        if (!active) return
        setError(err instanceof Error ? err.message : 'Failed to load parking.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [search, nonce])

  return { spaces, loading, error, reload }
}
