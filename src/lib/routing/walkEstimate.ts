/**
 * Walking distance from a parking space to the driver's destination.
 *
 * Straight-line, not a routed path: a route per listing would mean one Routes
 * API call for every result, on every search and every pan. This runs instantly
 * and costs nothing, which is what makes it usable for sorting.
 *
 * The tradeoff is accuracy. Streets are not straight, so the real walk is longer
 * than the great-circle distance — hence `STREET_FACTOR` and the "≈" the UI
 * shows. When a driver actually opens a listing, the exact route is fetched and
 * replaces this estimate. An estimate that is honest about being one is more
 * useful than a precise number nobody can afford to compute sixty times.
 */

const EARTH_RADIUS_M = 6_371_000

/**
 * Walking pace in metres per minute. 4.8 km/h, matching the constant used for
 * walking estimates elsewhere in the app.
 */
export const WALKING_METRES_PER_MINUTE = 80

/**
 * Ratio of street distance to straight-line distance.
 *
 * Grid cities run around 1.2–1.4; 1.3 is a reasonable middle. It is a fudge
 * factor and is labelled as an estimate in the UI rather than presented as fact.
 */
export const STREET_FACTOR = 1.3

export interface LatLngLike {
  lat: number
  lng: number
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180
}

/** Great-circle distance in metres. */
export function straightLineMeters(a: LatLngLike, b: LatLngLike): number {
  const dLat = toRadians(b.lat - a.lat)
  const dLng = toRadians(b.lng - a.lng)
  const lat1 = toRadians(a.lat)
  const lat2 = toRadians(b.lat)

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

/**
 * Estimated walking metres from a space to a destination.
 *
 * Returns null when either point is missing, so callers can render nothing
 * rather than a misleading zero.
 */
export function estimatedWalkMeters(
  from: LatLngLike | null | undefined,
  to: LatLngLike | null | undefined,
): number | null {
  if (!from || !to) return null
  if (!Number.isFinite(from.lat) || !Number.isFinite(from.lng)) return null
  if (!Number.isFinite(to.lat) || !Number.isFinite(to.lng)) return null

  return Math.round(straightLineMeters(from, to) * STREET_FACTOR)
}

/**
 * Estimated walking time in whole minutes, never below one.
 *
 * A space a few metres from the destination is still a walk, and "0 min" reads
 * as a bug.
 */
export function estimatedWalkMinutes(
  from: LatLngLike | null | undefined,
  to: LatLngLike | null | undefined,
): number | null {
  const metres = estimatedWalkMeters(from, to)
  if (metres === null) return null

  return Math.max(1, Math.round(metres / WALKING_METRES_PER_MINUTE))
}
