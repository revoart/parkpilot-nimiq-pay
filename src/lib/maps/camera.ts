import type { LatLng } from '@/utils/geo'

/**
 * Camera maths for the navigation map.
 *
 * GPS fixes arrive roughly once a second while the map renders at 60fps, so
 * applying each fix straight to the camera produces a visible jump every
 * second. These helpers let the camera be driven from a frame loop instead:
 * each frame eases the camera toward the latest fix, which makes motion
 * independent of how often the device reports.
 *
 * Everything here is pure so it can be tested without a browser or a map.
 */

/** Shortest signed turn from `from` to `to`, in degrees within [-180, 180). */
export function shortestArc(from: number, to: number): number {
  return ((((to - from) % 360) + 540) % 360) - 180
}

/** Wrap any angle into [0, 360). */
export function normalizeAngle(angle: number): number {
  return ((angle % 360) + 360) % 360
}

/**
 * Frame-rate independent exponential ease.
 *
 * `tauMs` is the time constant: after roughly `tauMs` the value has covered
 * about 63% of the remaining distance. Because the factor is derived from the
 * elapsed time, a slow frame eases further than a fast one and the motion looks
 * the same regardless of frame rate.
 */
export function easeToward(
  current: number,
  target: number,
  dtMs: number,
  tauMs: number,
): number {
  if (tauMs <= 0) return target
  if (dtMs <= 0) return current
  return current + (target - current) * (1 - Math.exp(-dtMs / tauMs))
}

/**
 * Ease an angle along the shortest arc, so 350° → 10° turns 20° right rather
 * than 340° left. Always returns a value in [0, 360).
 */
export function easeAngleToward(
  current: number,
  target: number,
  dtMs: number,
  tauMs: number,
): number {
  if (tauMs <= 0) return normalizeAngle(target)
  if (dtMs <= 0) return normalizeAngle(current)
  const next = current + shortestArc(current, target) * (1 - Math.exp(-dtMs / tauMs))
  return normalizeAngle(next)
}

/**
 * Low-pass a raw device heading.
 *
 * Device headings jitter by several degrees even when travelling straight, and
 * feeding that straight into the camera makes the map twitch. `alpha` is how
 * much of each new sample is taken: lower is smoother but laggier. The first
 * sample is taken as-is so a fresh fix does not sweep in from north.
 */
export function smoothHeading(
  previous: number | null,
  next: number,
  alpha = 0.35,
): number {
  const clamped = Math.min(Math.max(alpha, 0), 1)
  if (previous === null || !Number.isFinite(previous)) {
    return normalizeAngle(next)
  }
  return normalizeAngle(previous + shortestArc(previous, next) * clamped)
}

/**
 * Whether a heading has moved enough to be worth acting on, in degrees.
 *
 * Suppresses sub-degree churn so a stationary device does not keep nudging the
 * camera (and, on a vector map, does not keep re-issuing a rotation).
 */
export function headingChangedEnough(
  previous: number | null,
  next: number,
  thresholdDeg = 0.5,
): boolean {
  if (previous === null) return true
  return Math.abs(shortestArc(previous, next)) >= thresholdDeg
}

/** Great-circle distance between two points, in metres. */
export function distanceMeters(from: LatLng, to: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(to.lat - from.lat)
  const dLng = toRad(to.lng - from.lng)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(a)))
}

/**
 * Compass bearing from one point to another, in degrees clockwise from north.
 *
 * Used as a heading fallback: plenty of devices leave `coords.heading` null
 * even while moving, so the direction of travel is derived from the last two
 * fixes instead of leaving the map stuck pointing north.
 */
export function bearingBetween(from: LatLng, to: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const lat1 = toRad(from.lat)
  const lat2 = toRad(to.lat)
  const dLng = toRad(to.lng - from.lng)
  const y = Math.sin(dLng) * Math.cos(lat2)
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng)
  return normalizeAngle((Math.atan2(y, x) * 180) / Math.PI)
}

/** Ground resolution in metres per screen pixel at a latitude and zoom. */
export function metersPerPixel(lat: number, zoom: number): number {
  return (
    (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom)
  )
}

/**
 * Shift a point forward along `heading` by a number of screen pixels.
 *
 * With the camera rotated to the direction of travel (and no tilt), the top of
 * the screen points along the heading. Moving the camera centre forward
 * therefore renders the driver that many pixels *below* centre — which is how
 * the position marker is kept clear of the panel covering the bottom of the
 * map.
 */
export function offsetAlongHeading(
  point: LatLng,
  heading: number,
  metersPerPx: number,
  pixels: number,
): LatLng {
  const meters = pixels * metersPerPx
  const radians = (heading * Math.PI) / 180
  const dLat = (meters * Math.cos(radians)) / 111320
  const cosLat = Math.max(Math.cos((point.lat * Math.PI) / 180), 0.000001)
  const dLng = (meters * Math.sin(radians)) / (111320 * cosLat)
  return { lat: point.lat + dLat, lng: point.lng + dLng }
}
