import { describe, expect, it } from 'vitest'

import type { LatLng } from '@/utils/geo'

import { arrivalPhrase, legTarget } from './types'

const PARKING: LatLng = { lat: 43.6453, lng: -79.3806 }
const DESTINATION: LatLng = { lat: 43.6426, lng: -79.3871 }

describe('legTarget', () => {
  it('drives to the drive target', () => {
    expect(legTarget('drive', PARKING, DESTINATION)).toBe(PARKING)
  })

  it('walks to the walk destination', () => {
    expect(legTarget('walk', PARKING, DESTINATION)).toBe(DESTINATION)
  })

  it('never confuses the two legs', () => {
    // The defining ParkPilot rule: the car goes to the parking space, the
    // driver walks to the destination.
    const drive = legTarget('drive', PARKING, DESTINATION)
    const walk = legTarget('walk', PARKING, DESTINATION)
    expect(drive).not.toEqual(walk)
    expect(drive).toEqual(PARKING)
    expect(walk).toEqual(DESTINATION)
  })

  it('returns null when the relevant target is unknown', () => {
    expect(legTarget('drive', null, DESTINATION)).toBeNull()
    expect(legTarget('walk', PARKING, null)).toBeNull()
  })

  it('supports general navigation, where the drive target is the destination', () => {
    // No parking involved: the drive leg ends at the destination itself, and
    // there is no walk leg.
    expect(legTarget('drive', DESTINATION, null)).toEqual(DESTINATION)
  })
})

describe('arrivalPhrase', () => {
  it('names the parking space on a parking journey drive leg', () => {
    expect(arrivalPhrase('parking', 'drive')).toBe(
      'You have arrived at your parking destination.',
    )
  })

  it('names the destination on a parking journey walk leg', () => {
    expect(arrivalPhrase('parking', 'walk')).toBe(
      'You have arrived at your destination.',
    )
  })

  it('names the destination for general navigation', () => {
    // The drive leg ends at the destination, not a parking space, so calling it
    // a parking destination would be wrong.
    expect(arrivalPhrase('general', 'drive')).toBe(
      'You have arrived at your destination.',
    )
  })

  it('never claims a parking arrival outside a parking journey', () => {
    for (const leg of ['drive', 'walk'] as const) {
      expect(arrivalPhrase('general', leg)).not.toMatch(/parking/i)
    }
  })
})
