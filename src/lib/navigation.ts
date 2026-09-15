import type { LatLng } from '@/utils/geo'

/**
 * External navigation hand-off.
 *
 * Two distinct helpers on purpose: driving goes to the PARKING space, walking
 * goes to the DESTINATION. Keeping them separate makes it impossible to swap
 * the two by accident.
 */
export type TravelMode = 'driving' | 'walking' | 'transit' | 'bicycling'

export function directionsUrl(
  destination: LatLng,
  mode: TravelMode = 'driving',
  origin?: LatLng,
): string {
  const params = new URLSearchParams({
    api: '1',
    destination: `${destination.lat},${destination.lng}`,
    travelmode: mode,
    dir_action: 'navigate',
  })
  if (origin) params.set('origin', `${origin.lat},${origin.lng}`)
  return `https://www.google.com/maps/dir/?${params.toString()}`
}

/** Stage 1 — get the car to the parking space. */
export function navigateToParkingUrl(parking: LatLng): string {
  return directionsUrl(parking, 'driving')
}

/** Stage 2 — walk from the parking space to the actual destination. */
export function navigateToDestinationUrl(destination: LatLng): string {
  return directionsUrl(destination, 'walking')
}
