import type { Place } from '@/types'

export type PlaceKind = 'home' | 'work'

export interface SavedPlaces {
  home: Place | null
  work: Place | null
}

const SAVED_KEY = 'parkpilot.savedPlaces'
const RECENT_KEY = 'parkpilot.recentPlaces'
const RECENT_LIMIT = 8

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // storage unavailable — non-critical
  }
}

export function getSavedPlaces(): SavedPlaces {
  return readJson<SavedPlaces>(SAVED_KEY) ?? { home: null, work: null }
}

export function setSavedPlace(kind: PlaceKind, place: Place | null): SavedPlaces {
  const next = { ...getSavedPlaces(), [kind]: place }
  writeJson(SAVED_KEY, next)
  return next
}

/**
 * Recent destinations.
 *
 * Starts **empty**. It used to be pre-seeded with sample areas so the list was
 * never blank, which meant a brand-new driver saw places they had never been to
 * presented as their own history.
 */
export function getRecents(): Place[] {
  return readJson<Place[]>(RECENT_KEY) ?? []
}

export function addRecent(place: Place): Place[] {
  const current = getRecents().filter((item) => item.id !== place.id)
  const next = [place, ...current].slice(0, RECENT_LIMIT)
  writeJson(RECENT_KEY, next)
  return next
}

/** Removes a single recent place. */
export function removeRecent(id: string): Place[] {
  const next = getRecents().filter((item) => item.id !== id)
  writeJson(RECENT_KEY, next)
  return next
}

export function clearRecents(): void {
  writeJson(RECENT_KEY, [])
}
