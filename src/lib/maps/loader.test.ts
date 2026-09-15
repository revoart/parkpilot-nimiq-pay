import { afterEach, describe, expect, it } from 'vitest'

import { MAP_ID_OVERRIDE_KEY, hasMapId, resolveMapId } from './loader'

/**
 * The Map ID can come from a build-time env var or a runtime override. The
 * override has to win, because that is what lets rotation be switched on (or
 * rolled back) without a rebuild.
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

afterEach(clearBrowser)

describe('resolveMapId', () => {
  it('returns null without a browser', () => {
    clearBrowser()
    // No env var is set in the test environment, so there is nothing to use.
    expect(resolveMapId()).toBeNull()
    expect(hasMapId()).toBe(false)
  })

  it('returns null when the browser has no override', () => {
    stubBrowser({})
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
