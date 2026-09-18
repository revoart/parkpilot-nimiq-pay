import { describe, expect, it } from 'vitest'

import { MAX_UPLOAD_EDGE, fitWithin } from './resize'

describe('fitWithin', () => {
  it('leaves an image inside the limit untouched', () => {
    expect(fitWithin(800, 600, 1200)).toEqual({ width: 800, height: 600 })
  })

  it('scales a landscape image to the long edge', () => {
    expect(fitWithin(4000, 3000, 1200)).toEqual({ width: 1200, height: 900 })
  })

  it('scales a portrait image to the long edge', () => {
    expect(fitWithin(3000, 4000, 1200)).toEqual({ width: 900, height: 1200 })
  })

  it('handles a square image', () => {
    expect(fitWithin(4000, 4000, 1200)).toEqual({ width: 1200, height: 1200 })
  })

  it('never enlarges a small image', () => {
    const result = fitWithin(50, 40, 1200)
    expect(result).toEqual({ width: 50, height: 40 })
  })

  it('preserves aspect ratio', () => {
    const result = fitWithin(3000, 2000, 1200)
    expect(result.width / result.height).toBeCloseTo(1.5, 2)
  })

  it('returns zero for degenerate input', () => {
    expect(fitWithin(0, 100)).toEqual({ width: 0, height: 0 })
    expect(fitWithin(100, 0)).toEqual({ width: 0, height: 0 })
    expect(fitWithin(NaN, 100)).toEqual({ width: 0, height: 0 })
    expect(fitWithin(-10, 100)).toEqual({ width: 0, height: 0 })
  })

  it('never rounds a dimension down to zero', () => {
    // A very wide sliver must still produce a usable pixel dimension.
    const result = fitWithin(20000, 2, 1200)
    expect(result.height).toBeGreaterThanOrEqual(1)
  })

  it('uses the default edge when none is given', () => {
    expect(fitWithin(4000, 2000).width).toBe(MAX_UPLOAD_EDGE)
  })
})
