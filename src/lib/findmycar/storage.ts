export interface ParkedCar {
  reservationId: string
  parkingSpaceId: string
  title: string
  address: string
  lat: number
  lng: number
  timestamp: string
  note?: string
}

const CURRENT_KEY = 'parkpilot.parked.current'

function itemKey(reservationId: string): string {
  return `parkpilot.parked.${reservationId}`
}

export function saveParkedCar(car: ParkedCar): void {
  try {
    localStorage.setItem(itemKey(car.reservationId), JSON.stringify(car))
    localStorage.setItem(CURRENT_KEY, car.reservationId)
  } catch {
    // storage unavailable — non-critical
  }
}

export function getParkedCar(reservationId: string): ParkedCar | null {
  try {
    const raw = localStorage.getItem(itemKey(reservationId))
    return raw ? (JSON.parse(raw) as ParkedCar) : null
  } catch {
    return null
  }
}

export function getCurrentParkedCar(): ParkedCar | null {
  try {
    const id = localStorage.getItem(CURRENT_KEY)
    return id ? getParkedCar(id) : null
  } catch {
    return null
  }
}

export function clearParkedCar(reservationId: string): void {
  try {
    localStorage.removeItem(itemKey(reservationId))
    if (localStorage.getItem(CURRENT_KEY) === reservationId) {
      localStorage.removeItem(CURRENT_KEY)
    }
  } catch {
    // ignore
  }
}
