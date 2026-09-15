import { describe, expect, it } from 'vitest'

import { MAP_STYLE, MAP_STYLE_DARK } from './loader'
import {
  mapInitOptions,
  mapThemeOptions,
  rotationFor,
  supportsCameraRotation,
} from './options'

describe('mapInitOptions', () => {
  it('uses inline styles for a raster map (no Map ID)', () => {
    const options = mapInitOptions('light', null)
    expect(options.styles).toEqual(MAP_STYLE)
    expect(options.mapId).toBeUndefined()
    expect(options.colorScheme).toBeUndefined()
  })

  it('uses the dark palette for a raster map in dark mode', () => {
    expect(mapInitOptions('dark', null).styles).toEqual(MAP_STYLE_DARK)
  })

  it('uses a Map ID and colour scheme for a vector map', () => {
    const options = mapInitOptions('light', 'map-abc')
    expect(options.mapId).toBe('map-abc')
    expect(options.colorScheme).toBe('LIGHT')
  })

  it('selects the dark colour scheme for a vector map in dark mode', () => {
    expect(mapInitOptions('dark', 'map-abc').colorScheme).toBe('DARK')
  })

  it('never mixes the two modes', () => {
    // Google ignores inline styles once a Map ID is set, so sending both would
    // silently produce a map with no styling at all.
    for (const theme of ['light', 'dark'] as const) {
      expect(mapInitOptions(theme, 'map-abc').styles).toBeUndefined()

      const raster = mapInitOptions(theme, null)
      expect(raster.mapId).toBeUndefined()
      expect(raster.colorScheme).toBeUndefined()
      expect(raster.styles).toBeDefined()
    }
  })

  it('treats an empty Map ID as no Map ID', () => {
    // `resolveMapId` never returns '', but a falsy value must not be treated as
    // a vector map or the map would break.
    expect(mapInitOptions('light', '' as unknown as null).styles).toEqual(
      MAP_STYLE,
    )
  })
})

describe('mapThemeOptions', () => {
  it('never re-sends the Map ID', () => {
    // Re-applying mapId to an existing map is unsupported and resets the
    // camera, which silently discarded the navigation heading.
    const options = mapThemeOptions('dark', 'map-abc') as { mapId?: string }
    expect(options.mapId).toBeUndefined()
    expect(mapThemeOptions('dark', 'map-abc').colorScheme).toBe('DARK')
  })

  it('switches the colour scheme with the theme on a vector map', () => {
    expect(mapThemeOptions('light', 'map-abc').colorScheme).toBe('LIGHT')
    expect(mapThemeOptions('light', 'map-abc').styles).toBeUndefined()
  })

  it('switches inline styles with the theme on a raster map', () => {
    expect(mapThemeOptions('light', null).styles).toEqual(MAP_STYLE)
    expect(mapThemeOptions('dark', null).styles).toEqual(MAP_STYLE_DARK)
    expect(mapThemeOptions('dark', null).colorScheme).toBeUndefined()
  })
})

describe('supportsCameraRotation', () => {
  it('is false without a Map ID', () => {
    expect(supportsCameraRotation(null)).toBe(false)
  })

  it('is true with a Map ID', () => {
    expect(supportsCameraRotation('map-abc')).toBe(true)
  })
})

describe('rotationFor', () => {
  it('passes a normal heading through', () => {
    expect(rotationFor(90, 'map-abc')).toBe(90)
    expect(rotationFor(0, 'map-abc')).toBe(0)
  })

  it('normalises negative headings', () => {
    expect(rotationFor(-90, 'map-abc')).toBe(270)
  })

  it('normalises headings beyond a full turn', () => {
    expect(rotationFor(450, 'map-abc')).toBe(90)
    expect(rotationFor(360, 'map-abc')).toBe(0)
  })

  it('returns null without a Map ID so a raster map is never rotated', () => {
    expect(rotationFor(90, null)).toBeNull()
  })

  it('returns null when there is no heading', () => {
    expect(rotationFor(null, 'map-abc')).toBeNull()
    expect(rotationFor(undefined, 'map-abc')).toBeNull()
  })

  it('returns null for a non-finite heading', () => {
    expect(rotationFor(Number.NaN, 'map-abc')).toBeNull()
    expect(rotationFor(Number.POSITIVE_INFINITY, 'map-abc')).toBeNull()
  })

  it('keeps the result inside 0–360', () => {
    for (const heading of [-720, -1, 0, 359.9, 360, 1000]) {
      const value = rotationFor(heading, 'map-abc')
      expect(value).not.toBeNull()
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(360)
    }
  })
})
