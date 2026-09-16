/// <reference types="google.maps" />

import { normalizeAngle } from './camera'

export type GoogleMapsNamespace = typeof google.maps

export const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
const CHANNEL = import.meta.env.VITE_GOOGLE_MAPS_TRACKING_ID

/**
 * The build-time Map ID, read on each call rather than captured once at module
 * load. Reading it lazily keeps `resolveMapId` testable, because the value can
 * be stubbed per case instead of being frozen when the module first imports.
 *
 * When present the map renders vector tiles, which is what enables camera
 * rotation (`setHeading`). Without it the map is raster and rotation is
 * silently ignored — so the UI must not offer it. Google's own styles are
 * ignored once a Map ID is set, because styling moves to the cloud.
 */
function envMapId(): string | null {
  const value = (import.meta.env.VITE_GOOGLE_MAPS_MAP_ID ?? '').trim()
  return value.length > 0 ? value : null
}

/** Where a Map ID can be supplied at runtime instead of at build time. */
export const MAP_ID_OVERRIDE_KEY = 'parkpilot.map_id'

function runtimeMapId(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const fromWindow = (window as { __PARKPILOT_MAP_ID__?: unknown })
      .__PARKPILOT_MAP_ID__
    if (typeof fromWindow === 'string' && fromWindow.trim()) {
      return fromWindow.trim()
    }
    const fromStorage = window.localStorage.getItem(MAP_ID_OVERRIDE_KEY)
    return fromStorage && fromStorage.trim() ? fromStorage.trim() : null
  } catch {
    return null
  }
}

/**
 * The Map ID to use, if any.
 *
 * A runtime override beats the build-time env var. A Map ID is not a secret
 * (it ships in the bundle and is scoped to the project), so allowing it to be
 * set without a rebuild makes it trivial to switch rotation on — or roll it
 * back if a Map ID turns out to be wrong.
 */
export function resolveMapId(): string | null {
  const override = runtimeMapId()
  if (override) return override
  return envMapId()
}

export function hasMapId(): boolean {
  return resolveMapId() !== null
}

const LOAD_TIMEOUT_MS = 12_000

let loading: Promise<GoogleMapsNamespace> | null = null
const authFailureHandlers = new Set<() => void>()

export function isMapsConfigured(): boolean {
  return typeof MAPS_KEY === 'string' && MAPS_KEY.trim().length > 0
}

function loadedMaps(): GoogleMapsNamespace | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { google?: { maps?: GoogleMapsNamespace } }
  return w.google?.maps ?? null
}

/**
 * Fired by the Google Maps JS API when the key is missing, expired, not
 * authorised for this referrer, or the API/billing is not enabled.
 */
export function onMapsAuthFailure(handler: () => void): () => void {
  authFailureHandlers.add(handler)
  return () => {
    authFailureHandlers.delete(handler)
  }
}

export function loadMaps(): Promise<GoogleMapsNamespace> {
  if (loading) return loading

  const key = MAPS_KEY
  if (!key || !key.trim()) {
    return Promise.reject(new Error('Google Maps API key is not configured'))
  }

  const already = loadedMaps()
  if (already) {
    loading = Promise.resolve(already)
    return loading
  }

  loading = new Promise<GoogleMapsNamespace>((resolve, reject) => {
    window.gm_authFailure = () => {
      authFailureHandlers.forEach((handler) => handler())
    }

    const callbackName = '__parkpilotMapsReady'
    const timer = window.setTimeout(() => {
      reject(new Error('Google Maps failed to load in time'))
    }, LOAD_TIMEOUT_MS)

    const w = window as unknown as Record<string, unknown>
    w[callbackName] = () => {
      window.clearTimeout(timer)
      const maps = loadedMaps()
      if (maps) resolve(maps)
      else reject(new Error('Google Maps loaded without a namespace'))
    }

    const params = new URLSearchParams({
      key,
      loading: 'async',
      libraries: 'geometry',
      callback: callbackName,
    })
    if (CHANNEL) params.set('channel', CHANNEL)

    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`
    script.async = true
    script.onerror = () => {
      window.clearTimeout(timer)
      reject(new Error('Failed to load Google Maps'))
    }
    document.head.appendChild(script)
  })

  return loading
}

/** Muted, warm map styling matching the ParkPilot light palette. */
export const MAP_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#EDE9DF' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8A8579' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#EDE9DF' }] },
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#CDDEC5' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#FAFAF8' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#F2EEE4' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#DDE9F2' }] },
]

/** Night-mode map styling matching the ParkPilot dark palette. */
export const MAP_STYLE_DARK: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#141417' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#97979D' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#141417' }] },
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#1B241A' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#202024' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#26262B' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#2E2E34' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#101C28' }] },
]

export function mapStyle(theme: 'light' | 'dark'): google.maps.MapTypeStyle[] {
  return theme === 'dark' ? MAP_STYLE_DARK : MAP_STYLE
}

export interface MapIcon {
  url: string
  scaledSize: google.maps.Size
  anchor: google.maps.Point
}

function svgIcon(svg: string, width: number, height: number, anchorX: number, anchorY: number): MapIcon {
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(width, height),
    anchor: new google.maps.Point(anchorX, anchorY),
  }
}

/**
 * Cache of built icons, keyed by the values that actually change their pixels.
 *
 * Every icon is an SVG data URL, so rebuilding one allocates a string, a `Size`
 * and a `Point`, and — more expensively — forces the browser to decode a brand
 * new image. Marker sync runs on each render and the heading arrow changes on
 * every GPS fix, so without this the map re-decodes every icon continuously
 * while driving. Icons are immutable, so sharing them is safe.
 */
const iconCache = new Map<string, MapIcon>()

function cachedIcon(key: string, build: () => MapIcon): MapIcon {
  const hit = iconCache.get(key)
  if (hit) return hit
  const icon = build()
  iconCache.set(key, icon)
  return icon
}

/** Price pill with a pointer — black when selected, white otherwise. */
export function priceIcon(label: string, active: boolean): MapIcon {
  return cachedIcon(`price|${label}|${active ? 1 : 0}`, () => {
    const w = Math.max(46, 20 + label.length * 10)
    const bg = active ? '#0F0F0F' : '#FFFFFF'
    const fg = active ? '#FFFFFF' : '#0F0F0F'
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="40" viewBox="0 0 ${w} 40">
    <rect x="1" y="1" rx="13" width="${w - 2}" height="26" fill="${bg}" stroke="rgba(0,0,0,0.12)"/>
    <path d="M${w / 2 - 5} 26 L${w / 2} 34 L${w / 2 + 5} 26 Z" fill="${bg}"/>
    <text x="${w / 2}" y="19" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-size="13" font-weight="700" fill="${fg}">${label}</text>
  </svg>`
    return svgIcon(svg, w, 40, w / 2, 34)
  })
}

/** Solid dot used for the device position and generic points. */
export function dotIcon(color: string): MapIcon {
  return cachedIcon(`dot|${color}`, () => {
    const size = 26
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="13" cy="13" r="9" fill="${color}" stroke="#FFFFFF" stroke-width="3"/>
  </svg>`
    return svgIcon(svg, size, size, 13, 13)
  })
}

/** Circular pin carrying the first letter of a label. */
export function pinIcon(label?: string): MapIcon {
  const letter = (label ?? '').trim().slice(0, 1).replace(/[^A-Za-z0-9]/g, '') || 'P'
  return cachedIcon(`pin|${letter.toUpperCase()}`, () => {
    const size = 34
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="17" cy="17" r="14" fill="#0F0F0F" stroke="#FFFFFF" stroke-width="3"/>
    <text x="17" y="22" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-size="14" font-weight="700" fill="#FFFFFF">${letter.toUpperCase()}</text>
  </svg>`
    return svgIcon(svg, size, size, 17, 17)
  })
}

/**
 * Destination marker — deliberately a different shape and colour from the black
 * price pills so parking and the final destination never read as the same thing.
 */
export function destinationIcon(): MapIcon {
  return cachedIcon('destination', () => {
    const size = 34
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="17" cy="17" r="15" fill="#2563EB" stroke="#FFFFFF" stroke-width="3"/>
    <circle cx="17" cy="17" r="8" fill="none" stroke="#FFFFFF" stroke-width="2"/>
    <circle cx="17" cy="17" r="2.5" fill="#FFFFFF"/>
  </svg>`
    return svgIcon(svg, size, size, 17, 17)
  })
}

/**
 * The driver's position while navigating — an arrow pointing along the
 * direction of travel. Rotating the marker is how we convey heading when the
 * map itself is raster and cannot rotate.
 */
export function headingIcon(heading: number | null): MapIcon {
  const raw = heading === null || !Number.isFinite(heading) ? 0 : heading
  // Quantise the rotation into 2 degree buckets so the cache stays small. At
  // this marker size the step is invisible, and it means a slowly turning
  // driver reuses one icon instead of decoding a new image every fix.
  const bucket = Math.round(normalizeAngle(raw) / 2) * 2
  return cachedIcon(`heading|${bucket}`, () => {
    const size = 36
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <g transform="rotate(${bucket} 18 18)">
      <circle cx="18" cy="18" r="15" fill="#2563EB" stroke="#FFFFFF" stroke-width="2.5"/>
      <path d="M18 8 L25 25 L18 20.5 L11 25 Z" fill="#FFFFFF"/>
    </g>
  </svg>`
    return svgIcon(svg, size, size, 18, 18)
  })
}

/**
 * The driver's position on a heading-up map.
 *
 * When the camera itself rotates to the direction of travel, rotating this
 * marker too would point it the wrong way — so it is a fixed arrow aimed at the
 * top of the screen and the map supplies the heading.
 */
export function fixedArrowIcon(): MapIcon {
  return cachedIcon('arrow|fixed', () => {
    const size = 36
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="18" cy="18" r="15" fill="#2563EB" stroke="#FFFFFF" stroke-width="2.5"/>
    <path d="M18 8 L25 25 L18 20.5 L11 25 Z" fill="#FFFFFF"/>
  </svg>`
    return svgIcon(svg, size, size, 18, 18)
  })
}
