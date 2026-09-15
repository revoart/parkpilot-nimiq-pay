import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'

import type { Destination } from '@/types'

/**
 * The destination travels in the URL (the same `name`/`lat`/`lng` params the
 * search screen already uses), so it survives navigation from search → parking
 * detail → reserve → payment without extra global state.
 */
export function useDestination(): Destination | null {
  const [params] = useSearchParams()

  return useMemo(() => {
    const name = params.get('name')
    const lat = Number(params.get('lat'))
    const lng = Number(params.get('lng'))
    if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) return null
    return { name, lat, lng, address: params.get('address') }
  }, [params])
}

/** Serialise a destination back into a query string for the next screen. */
export function destinationQuery(destination: Destination | null): string {
  if (!destination) return ''
  const params = new URLSearchParams({
    name: destination.name,
    lat: String(destination.lat),
    lng: String(destination.lng),
  })
  if (destination.address) params.set('address', destination.address)
  return `?${params.toString()}`
}
