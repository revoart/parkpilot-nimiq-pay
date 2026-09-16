/// <reference types="google.maps" />

import { mapStyle } from './loader'

export type MapTheme = 'light' | 'dark'
export type MapColorScheme = 'LIGHT' | 'DARK'

/** Appearance-only options — safe to apply to a map that already exists. */
export interface MapAppearance {
  /** Present only for vector maps — replaces inline styling. */
  colorScheme?: MapColorScheme
  /** Present only for raster maps. */
  styles?: google.maps.MapTypeStyle[]
}

export interface MapInitOptions extends MapAppearance {
  /** Present only for vector maps. Set once, at construction. */
  mapId?: string
  /**
   * Explicitly request vector rendering.
   *
   * A Map ID alone is not enough: one created as Raster, or belonging to a
   * project the API key cannot see, leaves the map on the raster renderer where
   * `setHeading` is silently ignored. Asking for vector here makes the intent
   * explicit, and the option overrides whatever the Map ID was configured with.
   */
  renderingType?: 'VECTOR'
}

function appearanceFor(theme: MapTheme, mapId: string | null): MapAppearance {
  if (mapId) {
    return { colorScheme: theme === 'dark' ? 'DARK' : 'LIGHT' }
  }
  return { styles: mapStyle(theme) }
}

/**
 * Options for **constructing** the map. This is the only place the Map ID is
 * applied.
 *
 * A Map ID switches the map to vector rendering and moves styling into Google
 * Cloud, where inline `styles` are ignored — so the colour scheme is driven by
 * the app theme instead. Without a Map ID the inline muted palette is used.
 */
export function mapInitOptions(
  theme: MapTheme,
  mapId: string | null,
): MapInitOptions {
  const appearance = appearanceFor(theme, mapId)
  return mapId ? { mapId, renderingType: 'VECTOR', ...appearance } : appearance
}

/**
 * Options for re-theming a map that already exists.
 *
 * Deliberately **excludes `mapId`**: Google does not support changing the Map
 * ID after construction, and re-sending it resets the camera — which silently
 * threw away the navigation heading.
 */
export function mapThemeOptions(
  theme: MapTheme,
  mapId: string | null,
): MapAppearance {
  return appearanceFor(theme, mapId)
}

/**
 * Camera rotation is a vector-only capability. Raster maps silently ignore
 * `setHeading`, so callers must not claim to rotate without a Map ID.
 */
export function supportsCameraRotation(mapId: string | null): boolean {
  return Boolean(mapId)
}

/**
 * The heading to apply to the camera, or `null` to leave it untouched.
 *
 * Rotation requires a vector map, a known heading, and is normalised to
 * 0–360 so a negative or wrapped value from the device cannot spin the map.
 */
export function rotationFor(
  heading: number | null | undefined,
  mapId: string | null,
): number | null {
  if (!supportsCameraRotation(mapId)) return null
  if (heading === null || heading === undefined) return null
  if (!Number.isFinite(heading)) return null
  return ((heading % 360) + 360) % 360
}
