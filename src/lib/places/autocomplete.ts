export interface AddressSuggestion {
  id: string
  name: string
  address: string
  lat: number
  lng: number
}

interface PhotonFeature {
  properties: Record<string, unknown>
  geometry: { coordinates: [number, number] }
}

/**
 * Address autocomplete. Uses Photon (komoot) first — it is built for
 * type-ahead — and falls back to OpenStreetMap Nominatim. Both are keyless.
 */
export async function suggestAddresses(
  query: string,
  signal?: AbortSignal,
): Promise<AddressSuggestion[]> {
  const q = query.trim()
  if (q.length < 3) return []

  try {
    const response = await fetch(
      `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=6&lang=en`,
      { signal },
    )
    if (response.ok) {
      const data = (await response.json()) as { features?: PhotonFeature[] }
      const results = (data.features ?? [])
        .map((feature, index) => {
          const props = feature.properties
          const name = String(
            props.name ?? props.street ?? props.city ?? q,
          )
          const parts = [
            props.housenumber,
            props.street,
            props.city,
            props.state,
            props.country,
          ]
            .filter(Boolean)
            .map(String)
          const [lng, lat] = feature.geometry.coordinates
          return {
            id: `photon-${index}-${lat}-${lng}`,
            name,
            address: parts.join(', ') || name,
            lat,
            lng,
          }
        })
        .filter(
          (item) =>
            Number.isFinite(item.lat) && Number.isFinite(item.lng),
        )

      if (results.length > 0) return results
    }
  } catch {
    // fall through to Nominatim
  }

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=6&q=${encodeURIComponent(
        q,
      )}`,
      { signal, headers: { Accept: 'application/json' } },
    )
    if (response.ok) {
      const data = (await response.json()) as Array<{
        display_name: string
        lat: string
        lon: string
      }>
      return data.map((item, index) => ({
        id: `nominatim-${index}-${item.lat}-${item.lon}`,
        name: item.display_name.split(',')[0] ?? item.display_name,
        address: item.display_name,
        lat: Number(item.lat),
        lng: Number(item.lon),
      }))
    }
  } catch {
    // ignore
  }

  return []
}
