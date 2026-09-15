import { describe, expect, it } from 'vitest'

import {
  directionsUrl,
  navigateToDestinationUrl,
  navigateToParkingUrl,
} from './navigation'

const PARKING = { lat: 43.6532, lng: -79.3832 }
const DESTINATION = { lat: 43.6486, lng: -79.3817 }

function params(url: string): URLSearchParams {
  return new URLSearchParams(new URL(url).search)
}

describe('directionsUrl', () => {
  it('builds a Google Maps directions link', () => {
    const url = directionsUrl(PARKING)
    expect(url.startsWith('https://www.google.com/maps/dir/?')).toBe(true)
    expect(params(url).get('api')).toBe('1')
    expect(params(url).get('dir_action')).toBe('navigate')
  })

  it('defaults to driving', () => {
    expect(params(directionsUrl(PARKING)).get('travelmode')).toBe('driving')
  })

  it('encodes the destination coordinates', () => {
    expect(params(directionsUrl(PARKING)).get('destination')).toBe(
      '43.6532,-79.3832',
    )
  })

  it('omits origin when none is given', () => {
    expect(params(directionsUrl(PARKING)).get('origin')).toBeNull()
  })

  it('includes origin when given', () => {
    const url = directionsUrl(DESTINATION, 'walking', PARKING)
    expect(params(url).get('origin')).toBe('43.6532,-79.3832')
    expect(params(url).get('destination')).toBe('43.6486,-79.3817')
  })
})

describe('parking vs destination hand-off', () => {
  it('drives to the parking space', () => {
    const p = params(navigateToParkingUrl(PARKING))
    expect(p.get('destination')).toBe('43.6532,-79.3832')
    expect(p.get('travelmode')).toBe('driving')
  })

  it('walks to the destination', () => {
    const p = params(navigateToDestinationUrl(DESTINATION))
    expect(p.get('destination')).toBe('43.6486,-79.3817')
    expect(p.get('travelmode')).toBe('walking')
  })

  it('never swaps the two stages', () => {
    const toParking = params(navigateToParkingUrl(PARKING)).get('destination')
    const toDestination = params(navigateToDestinationUrl(DESTINATION)).get(
      'destination',
    )
    expect(toParking).not.toBe(toDestination)
    expect(toParking).toBe('43.6532,-79.3832')
    expect(toDestination).toBe('43.6486,-79.3817')
  })
})
