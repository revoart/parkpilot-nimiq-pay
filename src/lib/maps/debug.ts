/// <reference types="google.maps" />

/**
 * Debug handles for the map.
 *
 * Rotation and vector rendering can only be diagnosed from a real browser, so
 * these are gated behind a build flag rather than always present. Enable with
 * `VITE_DEBUG_MAP=true` locally; leave it unset in production.
 *
 * They expose no secrets — a map instance is the same object already running in
 * the tab — but there is no reason to ship debug surface to users.
 */
export const MAP_DEBUG = import.meta.env.VITE_DEBUG_MAP === 'true'

export function exposeMapDebug(key: string, value: unknown): void {
  if (!MAP_DEBUG) return
  if (typeof window === 'undefined') return
  ;(window as unknown as Record<string, unknown>)[key] = value
}
