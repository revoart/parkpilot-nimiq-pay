import type { LatLng } from '@/utils/geo'

/**
 * Best-effort forward geocoding using OpenStreetMap Nominatim (free, no key).
 * Returns null when the address cannot be resolved or the request fails, so
 * callers can fall back gracefully.
 */
export async function geocodeAddress(query: string): Promise<LatLng | null> {
  const trimmed = query.trim()
  if (trimmed.length < 3) return null

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)

    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(
      trimmed,
    )}`
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
    clearTimeout(timeout)

    if (!response.ok) return null

    const data = (await response.json()) as Array<{ lat: string; lon: string }>
    if (!Array.isArray(data) || data.length === 0) return null

    const lat = Number(data[0].lat)
    const lng = Number(data[0].lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null

    return { lat, lng }
  } catch {
    return null
  }
}
