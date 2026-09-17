/**
 * Posted speed limits from OpenStreetMap.
 *
 * Google does not expose speed limits to the Maps JavaScript API — its Roads
 * API `speedLimits` endpoint requires an Asset Tracking licence, which is why
 * even a stock Google Maps embed shows no speed limit. OSM's `maxspeed` tag is
 * the practical free source, queried through Overpass.
 *
 * Overpass is a shared community resource, so requests are snapped to a coarse
 * grid and cached: the same cell is only ever queried once per session, and the
 * driver moving a few metres does not produce a new request.
 */

export interface SpeedLimit {
  /** Posted limit in the returned units. */
  limit: number
  units: 'km/h' | 'mph'
  /** Road name, when OSM has one. Useful context next to the sign. */
  road: string | null
}

const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter'

/** Snap radius around the driver, in metres. */
const SEARCH_RADIUS_M = 50

/**
 * Cell size for caching, in degrees. ~0.00025° is roughly 25 m of latitude —
 * small enough that a limit change is noticed promptly, large enough that
 * normal driving inside one block reuses a single lookup.
 */
const CELL_DEGREES = 0.00025

const CACHE_TTL_MS = 10 * 60_000

interface CacheEntry {
  value: SpeedLimit | null
  at: number
}

const cache = new Map<string, CacheEntry>()
const inFlight = new Map<string, Promise<SpeedLimit | null>>()

/**
 * Country-specific default limits OSM encodes as a token instead of a number.
 * Only the forms that appear in practice are listed; anything unrecognised is
 * treated as unknown rather than guessed at.
 */
const TOKEN_LIMITS: Record<string, number> = {
  walk: 5,
  none: 0,
}

/**
 * Parse an OSM `maxspeed` tag.
 *
 * Handles the forms that actually occur: `50`, `50 km/h`, `30 mph`,
 * `50kmh`, `walk`, `none`, and the `CA:urban` style region defaults.
 */
export function parseMaxspeed(value: unknown): Omit<SpeedLimit, 'road'> | null {
  if (typeof value !== 'string') return null

  const text = value.trim().toLowerCase()
  if (!text) return null

  // `none` means no legal limit (German autobahn). There is no number to show,
  // and showing "0" would be actively wrong, so treat it as unknown.
  if (text === 'none' || text === 'signals' || text === 'variable') return null

  const token = TOKEN_LIMITS[text]
  if (token !== undefined) {
    return token > 0 ? { limit: token, units: 'km/h' } : null
  }

  const match = text.match(/^(\d+(?:\.\d+)?)\s*(km\/?h|kph|mph|knots)?/)
  if (!match) return null

  const limit = Number(match[1])
  if (!Number.isFinite(limit) || limit <= 0) return null

  const unit = match[2] ?? ''
  if (unit.startsWith('mph')) return { limit, units: 'mph' }
  if (unit === 'knots') return { limit: Math.round(limit * 1.852), units: 'km/h' }

  // Bare numbers and km/h forms are km/h. A bare number is only ambiguous in
  // mph countries, where OSM normally writes the unit explicitly.
  return { limit, units: 'km/h' }
}

/** Grid key for the cache, so nearby lookups share one entry. */
export function cellKey(lat: number, lng: number): string {
  const latCell = Math.round(lat / CELL_DEGREES)
  const lngCell = Math.round(lng / CELL_DEGREES)
  return `${latCell}:${lngCell}`
}

interface OverpassElement {
  tags?: Record<string, string>
  center?: { lat: number; lon: number }
}

/**
 * Fetch the speed limit for the road nearest a point.
 *
 * Returns null when OSM has no usable data. Never throws: a missing speed limit
 * must not break navigation.
 */
export async function fetchSpeedLimit(
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<SpeedLimit | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null

  const key = cellKey(lat, lng)

  const cached = cache.get(key)
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value

  const pending = inFlight.get(key)
  if (pending) return pending

  const request = (async (): Promise<SpeedLimit | null> => {
    try {
      const query = [
        '[out:json][timeout:8];',
        `way(around:${SEARCH_RADIUS_M},${lat},${lng})[highway][maxspeed];`,
        'out center;',
      ].join('')

      const response = await fetch(OVERPASS_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
        signal,
      })
      if (!response.ok) return null

      const payload = (await response.json()) as { elements?: OverpassElement[] }
      const elements = payload.elements ?? []

      // Prefer the nearest element that parses to a real limit.
      let best: SpeedLimit | null = null
      let bestDistance = Number.POSITIVE_INFINITY

      for (const element of elements) {
        const parsed = parseMaxspeed(element.tags?.maxspeed)
        if (!parsed) continue

        const center = element.center
        const distance = center
          ? (center.lat - lat) ** 2 + (center.lon - lng) ** 2
          : 0
        if (distance < bestDistance) {
          bestDistance = distance
          best = { ...parsed, road: element.tags?.name ?? null }
        }
      }

      return best
    } catch {
      // Offline, rate-limited, malformed — all the same to the caller.
      return null
    } finally {
      inFlight.delete(key)
    }
  })()

  inFlight.set(key, request)
  const value = await request
  cache.set(key, { value, at: Date.now() })
  return value
}

/** Test seam. */
export function clearSpeedLimitCache(): void {
  cache.clear()
  inFlight.clear()
}
