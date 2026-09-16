import { getSupabase } from '@/lib/supabase/client'
import { readFunctionError } from '@/lib/supabase/functions'

/**
 * The NIM/USDT rate, fetched from our own `nim-price` function.
 *
 * The function caches for a minute, so this only avoids a round trip on rapid
 * re-renders; correctness does not depend on the client cache.
 */

export interface NimPrice {
  rate_usdt: number
  fetched_at: string | null
  age_seconds: number | null
  stale: boolean
}

const CACHE_KEY = 'parkpilot.nim-price'
const CLIENT_CACHE_MS = 30_000

interface Cached {
  price: NimPrice
  storedAt: number
}

function readCache(): NimPrice | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw) as Cached
    if (Date.now() - parsed.storedAt > CLIENT_CACHE_MS) return null
    if (!Number.isFinite(parsed.price?.rate_usdt)) return null

    return parsed.price
  } catch {
    return null
  }
}

function writeCache(price: NimPrice): void {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ price, storedAt: Date.now() }))
  } catch {
    // A full or unavailable session store is not worth failing a price read for.
  }
}

export async function fetchNimPrice(): Promise<NimPrice> {
  const cached = readCache()
  if (cached) return cached

  const supabase = getSupabase()
  const { data, error } = await supabase.functions.invoke('nim-price', { body: {} })

  if (error) {
    throw new Error(await readFunctionError(error, 'Could not load the NIM price.'))
  }

  const result = data as (NimPrice & { error?: string }) | null
  if (!result || result.error || !Number.isFinite(result.rate_usdt)) {
    throw new Error(result?.error ?? 'Could not load the NIM price.')
  }

  writeCache(result)
  return result
}
