import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { ReactNode } from 'react'

import { fetchNimPrice, type NimPrice } from '@/lib/price/service'
import { MAX_EQUIVALENT_AGE_MS, isRateFresh } from '@/lib/nimiq/price'

/**
 * One NIM/USDT rate for the whole app.
 *
 * Provided rather than fetched per component so a screen showing a dozen prices
 * makes one request, and so every price on screen is converted at the same rate
 * — two listings must never disagree about what NIM is worth.
 *
 * A failure is not surfaced as an error banner: the dollar equivalent simply
 * disappears. It is a convenience, not something the app depends on.
 */

interface NimPriceContextValue {
  /** USDT per NIM, or null when unavailable. */
  rateUsdt: number | null
  fetchedAt: string | null
  loading: boolean
  /** True when a rate exists but is too old to display. */
  stale: boolean
  refresh: () => Promise<void>
}

const NimPriceContext = createContext<NimPriceContextValue | null>(null)

const REFRESH_MS = 60_000

export function NimPriceProvider({ children }: { children: ReactNode }) {
  const [price, setPrice] = useState<NimPrice | null>(null)
  const [loading, setLoading] = useState(true)
  const mounted = useRef(true)

  const load = useCallback(async () => {
    try {
      const next = await fetchNimPrice()
      if (mounted.current) setPrice(next)
    } catch {
      // Keep whatever rate we already have; staleness decides whether it shows.
    } finally {
      if (mounted.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    mounted.current = true
    void load()

    const timer = setInterval(() => void load(), REFRESH_MS)
    return () => {
      mounted.current = false
      clearInterval(timer)
    }
  }, [load])

  const value = useMemo<NimPriceContextValue>(() => {
    const rate = price && Number.isFinite(price.rate_usdt) ? price.rate_usdt : null
    const fresh = isRateFresh(price?.fetched_at ?? null)

    return {
      rateUsdt: rate,
      fetchedAt: price?.fetched_at ?? null,
      loading,
      stale: rate !== null && !fresh,
      refresh: load,
    }
  }, [price, loading, load])

  return (
    <NimPriceContext.Provider value={value}>{children}</NimPriceContext.Provider>
  )
}

export function useNimPrice(): NimPriceContextValue {
  const context = useContext(NimPriceContext)
  if (!context) {
    throw new Error('useNimPrice must be used inside a NimPriceProvider')
  }
  return context
}

export { MAX_EQUIVALENT_AGE_MS }
