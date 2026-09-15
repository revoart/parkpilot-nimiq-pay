import type { LatLng } from '@/utils/geo'

export interface GeocodeResult extends LatLng {
  /** Stable provider reference (e.g. `node:123456`), for deduping places. */
  placeId: string | null
  /** The provider's full formatted address, when it differs from the query. */
  label: string | null
}

/**
 * Forward geocoding using OpenStreetMap Nominatim (free, no key).
 *
 * Returns `null` when the address cannot be resolved. Callers must treat that
 * as a failure — never as licence to substitute some other location.
 */
export async function geocodeAddress(
  query: string,
): Promise<GeocodeResult | null> {
  const trimmed = query.trim()
  if (trimmed.length < 3) return null

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)

    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=1&q=${encodeURIComponent(
      trimmed,
    )}`
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
    clearTimeout(timeout)

    if (!response.ok) return null

    const data = (await response.json()) as Array<{
      lat: string
      lon: string
      display_name?: string
      osm_type?: string
      osm_id?: number
    }>
    if (!Array.isArray(data) || data.length === 0) return null

    const lat = Number(data[0].lat)
    const lng = Number(data[0].lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null

    const { osm_type: osmType, osm_id: osmId } = data[0]

    return {
      lat,
      lng,
      placeId: osmType && osmId ? `${osmType}:${osmId}` : null,
      label: data[0].display_name ?? null,
    }
  } catch {
    return null
  }
}
