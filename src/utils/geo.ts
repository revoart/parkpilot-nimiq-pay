export interface LatLng {
  lat: number
  lng: number
}

/** Downtown Toronto — the demo catalogue's centre. */
export const TORONTO_CENTER: LatLng = { lat: 43.6532, lng: -79.3832 }

const EARTH_RADIUS_KM = 6371

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180
}

/** Great-circle distance in kilometres. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.lat - a.lat)
  const dLng = toRadians(b.lng - a.lng)
  const lat1 = toRadians(a.lat)
  const lat2 = toRadians(b.lat)

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Rough walking time assuming 4.8 km/h. */
export function walkingMinutes(km: number): number {
  return Math.max(1, Math.round((km / 4.8) * 60))
}
