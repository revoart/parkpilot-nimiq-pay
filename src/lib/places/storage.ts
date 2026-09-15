import { TORONTO_PLACES, type Place } from './data'

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

const MIN_RECENTS = 5

/**
 * Recent destinations.
 *
 * Seeded once on first run with demo areas so the list is never empty — but
 * only when nothing has been stored yet. After that the user's list is
 * authoritative, so removing a recent actually sticks.
 */
export function getRecents(): Place[] {
  const stored = readJson<Place[]>(RECENT_KEY)
  if (stored) return stored

  const seeded = TORONTO_PLACES.slice(0, MIN_RECENTS)
  writeJson(RECENT_KEY, seeded)
  return seeded
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
