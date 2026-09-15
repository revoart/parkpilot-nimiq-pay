import { describe, expect, it } from 'vitest'

import { decodePolyline, joinPaths, samePoint } from './polyline'

describe('decodePolyline', () => {
  it('decodes the canonical Google example', () => {
    // From Google's encoded polyline algorithm documentation.
    const points = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@')
    expect(points).toHaveLength(3)
    expect(points[0].lat).toBeCloseTo(38.5, 5)
    expect(points[0].lng).toBeCloseTo(-120.2, 5)
    expect(points[1].lat).toBeCloseTo(40.7, 5)
    expect(points[1].lng).toBeCloseTo(-120.95, 5)
    expect(points[2].lat).toBeCloseTo(43.252, 5)
    expect(points[2].lng).toBeCloseTo(-126.453, 5)
  })

  it('decodes negative and positive deltas in the same path', () => {
    const points = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@')
    expect(points[1].lat).toBeGreaterThan(points[0].lat)
    expect(points[1].lng).toBeLessThan(points[0].lng)
  })

  it('returns nothing for an empty string', () => {
    expect(decodePolyline('')).toEqual([])
  })

  it('decodes a single point', () => {
    const points = decodePolyline('_p~iF~ps|U')
    expect(points).toHaveLength(1)
    expect(points[0].lat).toBeCloseTo(38.5, 5)
  })

  it('round-trips a dense path without drift', () => {
    const encoded = 'oyzkG}``zM}@_A}@_A}@_A'
    const points = decodePolyline(encoded)
    expect(points.length).toBeGreaterThan(3)
    // Each successive point must stay within a plausible city-block distance.
    for (let index = 1; index < points.length; index += 1) {
      const dLat = Math.abs(points[index].lat - points[index - 1].lat)
      const dLng = Math.abs(points[index].lng - points[index - 1].lng)
      expect(dLat).toBeLessThan(0.05)
      expect(dLng).toBeLessThan(0.05)
    }
  })
})

describe('samePoint', () => {
  it('treats near-identical coordinates as equal', () => {
    expect(samePoint({ lat: 43.6532, lng: -79.3832 }, { lat: 43.6532, lng: -79.3832 })).toBe(
      true,
    )
    expect(
      samePoint(
        { lat: 43.6532, lng: -79.3832 },
        { lat: 43.653200001, lng: -79.383200001 },
      ),
    ).toBe(true)
  })

  it('separates distinct points', () => {
    expect(samePoint({ lat: 43.65, lng: -79.38 }, { lat: 43.66, lng: -79.38 })).toBe(
      false,
    )
  })
})

describe('joinPaths', () => {
  it('drops the duplicated vertex between consecutive parts', () => {
    const joined = joinPaths([
      [
        { lat: 1, lng: 1 },
        { lat: 2, lng: 2 },
      ],
      [
        { lat: 2, lng: 2 },
        { lat: 3, lng: 3 },
      ],
    ])
    expect(joined).toEqual([
      { lat: 1, lng: 1 },
      { lat: 2, lng: 2 },
      { lat: 3, lng: 3 },
    ])
  })

  it('keeps parts that do not share a boundary', () => {
    const joined = joinPaths([
      [{ lat: 1, lng: 1 }],
      [{ lat: 9, lng: 9 }],
    ])
    expect(joined).toHaveLength(2)
  })

  it('handles empty input', () => {
    expect(joinPaths([])).toEqual([])
    expect(joinPaths([[], []])).toEqual([])
  })
})
