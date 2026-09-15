import type { LatLng } from '@/utils/geo'

/**
 * Decode a Google encoded polyline (precision 5) into coordinates.
 *
 * Implemented locally rather than via `google.maps.geometry.encoding` so the
 * routing layer stays pure, testable and independent of the Maps script.
 */
export function decodePolyline(encoded: string): LatLng[] {
  if (!encoded) return []

  const points: LatLng[] = []
  let index = 0
  let lat = 0
  let lng = 0

  while (index < encoded.length) {
    let result = 1
    let shift = 0
    let byte: number

    do {
      byte = encoded.charCodeAt(index++) - 63 - 1
      result += byte << shift
      shift += 5
    } while (byte >= 0x1f)

    lat += result & 1 ? ~(result >> 1) : result >> 1

    result = 1
    shift = 0

    do {
      byte = encoded.charCodeAt(index++) - 63 - 1
      result += byte << shift
      shift += 5
    } while (byte >= 0x1f)

    lng += result & 1 ? ~(result >> 1) : result >> 1

    points.push({ lat: lat / 1e5, lng: lng / 1e5 })
  }

  return points
}

/** Two coordinates are "the same point" for geometry purposes. */
export function samePoint(a: LatLng, b: LatLng): boolean {
  return Math.abs(a.lat - b.lat) < 1e-6 && Math.abs(a.lng - b.lng) < 1e-6
}

/**
 * Join step geometries into one continuous path, dropping the duplicated
 * vertex where one step ends and the next begins.
 */
export function joinPaths(parts: LatLng[][]): LatLng[] {
  const out: LatLng[] = []
  for (const part of parts) {
    for (const point of part) {
      const last = out[out.length - 1]
      if (last && samePoint(last, point)) continue
      out.push(point)
    }
  }
  return out
}
