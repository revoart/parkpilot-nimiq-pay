import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MAP_ID_OVERRIDE_KEY, hasMapId, resolveMapId } from './loader'

/**
 * The Map ID can come from a build-time env var or a runtime override. The
 * override has to win, because that is what lets rotation be switched on (or
 * rolled back) without a rebuild.
 *
 * The env var is stubbed per test rather than relying on whatever the local
 * `.env` happens to hold, so these cases describe the logic rather than the
 * developer's machine.
 */
function stubBrowser(options: {
  windowValue?: string
  storageValue?: string
}): void {
  const store = new Map<string, string>()
  if (options.storageValue !== undefined) {
    store.set(MAP_ID_OVERRIDE_KEY, options.storageValue)
  }

  ;(globalThis as unknown as { window: unknown }).window = {
    __PARKPILOT_MAP_ID__: options.windowValue,
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
    },
  }
}

function clearBrowser(): void {
  delete (globalThis as unknown as { window?: unknown }).window
}

beforeEach(() => {
  vi.stubEnv('VITE_GOOGLE_MAPS_MAP_ID', '')
})

afterEach(() => {
  clearBrowser()
  vi.unstubAllEnvs()
})

describe('resolveMapId', () => {
  it('returns null without a browser', () => {
    clearBrowser()
    expect(resolveMapId()).toBeNull()
    expect(hasMapId()).toBe(false)
  })

  it('returns null when neither the env nor the browser supplies one', () => {
    stubBrowser({})
    expect(resolveMapId()).toBeNull()
  })

  it('falls back to the build-time env var', () => {
    stubBrowser({})
    vi.stubEnv('VITE_GOOGLE_MAPS_MAP_ID', 'map-from-env')
    expect(resolveMapId()).toBe('map-from-env')
    expect(hasMapId()).toBe(true)
  })

  it('ignores a blank env var', () => {
    stubBrowser({})
    vi.stubEnv('VITE_GOOGLE_MAPS_MAP_ID', '   ')
    expect(resolveMapId()).toBeNull()
  })

  it('uses a localStorage override', () => {
    stubBrowser({ storageValue: 'map-from-storage' })
    expect(resolveMapId()).toBe('map-from-storage')
    expect(hasMapId()).toBe(true)
  })

  it('prefers the window override over localStorage', () => {
    stubBrowser({ windowValue: 'map-from-window', storageValue: 'map-from-storage' })
    expect(resolveMapId()).toBe('map-from-window')
  })

  it('prefers an override over the env var', () => {
    // This is what makes rotation rollable-back without a rebuild.
    stubBrowser({ storageValue: 'map-from-storage' })
    vi.stubEnv('VITE_GOOGLE_MAPS_MAP_ID', 'map-from-env')
    expect(resolveMapId()).toBe('map-from-storage')
  })

  it('ignores blank overrides', () => {
    stubBrowser({ windowValue: '   ', storageValue: '' })
    expect(resolveMapId()).toBeNull()
  })

  it('trims surrounding whitespace', () => {
    stubBrowser({ windowValue: '  map-padded  ' })
    expect(resolveMapId()).toBe('map-padded')
  })

  it('survives a browser that blocks storage', () => {
    ;(globalThis as unknown as { window: unknown }).window = {
      localStorage: {
        getItem: () => {
          throw new Error('storage disabled')
        },
      },
    }
    expect(resolveMapId()).toBeNull()
  })
})
