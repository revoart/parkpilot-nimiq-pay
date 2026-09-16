import type { ParkingSpace } from '@/types'

const KEY = 'parkpilot.saved'

export type SavedParking = Pick<
  ParkingSpace,
  | 'id'
  | 'title'
  | 'address'
  | 'latitude'
  | 'longitude'
  | 'price_nim'
  | 'parking_type'
  | 'covered'
  | 'ev_charging'
  | 'accessible'
  | 'image_url'
>

function read(): SavedParking[] {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as SavedParking[]) : []
  } catch {
    return []
  }
}

function write(items: SavedParking[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(items))
  } catch {
    // storage unavailable — non-critical
  }
}

export function listSaved(): SavedParking[] {
  return read()
}

export function isSaved(id: string): boolean {
  return read().some((item) => item.id === id)
}

/** Toggles a parking space and returns its new saved state. */
export function toggleSaved(space: ParkingSpace): boolean {
  const items = read()
  const existing = items.findIndex((item) => item.id === space.id)

  if (existing >= 0) {
    items.splice(existing, 1)
    write(items)
    return false
  }

  const saved: SavedParking = {
    id: space.id,
    title: space.title,
    address: space.address,
    latitude: space.latitude,
    longitude: space.longitude,
    price_nim: space.price_nim,
    parking_type: space.parking_type,
    covered: space.covered,
    ev_charging: space.ev_charging,
    accessible: space.accessible,
    image_url: space.image_url ?? null,
  }
  write([saved, ...items])
  return true
}

export function removeSaved(id: string): void {
  write(read().filter((item) => item.id !== id))
}
