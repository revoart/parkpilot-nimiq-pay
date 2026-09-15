import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const APP = resolve(__dirname, 'App.tsx')
const source = readFileSync(APP, 'utf8')

/** Every route the app ships, so a deleted screen fails CI instead of users. */
const EXPECTED_ROUTES = [
  '/',
  '/search',
  '/parking/:id',
  '/navigate/:id',
  '/reserve/:id',
  '/payment/:id',
  '/pass/:id',
  '/session/:id',
  '/my-parking',
  '/saved',
  '/profile',
  '/notifications',
  '/settings',
  '/find-my-car',
  '/privacy',
  '/host',
  '/host/add',
  '/host/space/:id',
  '/host/bookings',
  '/host/earnings',
]

function routePaths(): string[] {
  return [...source.matchAll(/<Route\s+path="([^"]+)"/g)].map(
    (match) => match[1],
  )
}

function lazyTargets(): string[] {
  return [...source.matchAll(/import\('(@\/screens\/[^']+)'\)/g)].map(
    (match) => match[1],
  )
}

describe('App routes', () => {
  it('registers every expected route', () => {
    const paths = routePaths()
    for (const route of EXPECTED_ROUTES) {
      expect(paths, `missing route ${route}`).toContain(route)
    }
  })

  it('still has a catch-all redirect', () => {
    expect(routePaths()).toContain('*')
  })

  it('does not register duplicate paths', () => {
    const paths = routePaths()
    expect(new Set(paths).size).toBe(paths.length)
  })
})

describe('lazy screen imports', () => {
  it('imports at least one screen', () => {
    expect(lazyTargets().length).toBeGreaterThan(10)
  })

  it('resolves every lazy import to a real file', () => {
    for (const target of lazyTargets()) {
      const relative = target.replace('@/', 'src/')
      const candidates = [`${relative}.tsx`, `${relative}.ts`, relative]
      const found = candidates.some((candidate) =>
        existsSync(resolve(__dirname, '..', candidate)),
      )
      expect(found, `unresolved lazy import ${target}`).toBe(true)
    }
  })

  it('has a lazy import for every screen route', () => {
    const screenRoutes = routePaths().filter((path) => path !== '*')
    expect(lazyTargets().length).toBeGreaterThanOrEqual(screenRoutes.length)
  })
})
