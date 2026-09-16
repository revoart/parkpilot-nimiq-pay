import { createClient } from 'npm:@supabase/supabase-js@2'

import { errorResponse, json, preflight } from '../_shared/http.ts'
import {
  NIM_PRICE_TTL_MS,
  VENUES,
  isPlausibleRate,
  medianRate,
} from '../_shared/price.ts'

/**
 * The NIM/USDT rate that powers every dollar equivalent in the app.
 *
 * Public on purpose: browsing prices must not require signing in. Cheap by
 * design — the rate is cached for a minute, so however many users ask, the
 * venues are polled at most once a minute.
 *
 * Caching server-side rather than per client is the point. It keeps the app
 * inside the venues' rate limits, and it guarantees a driver and a host looking
 * at the same listing see the same number instead of two different ones.
 *
 * When the rate cannot be refreshed, the last known value is returned flagged
 * `stale`. The client hides the equivalent once it is too old; it never invents
 * one.
 */
Deno.serve(async (request) => {
  const options = preflight(request)
  if (options) return options
  if (request.method !== 'POST') {
    return errorResponse(request, 'Method not allowed', 405)
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: cached } = await supabase
      .from('nim_price_cache')
      .select('rate_usdt, fetched_at, sources')
      .maybeSingle()

    const previousRate = cached ? Number(cached.rate_usdt) : null
    const fetchedAt = cached ? new Date(cached.fetched_at as string) : null
    const ageMs = fetchedAt ? Date.now() - fetchedAt.getTime() : Infinity

    // Fresh enough: serve it without touching the network.
    if (previousRate && Number.isFinite(previousRate) && ageMs < NIM_PRICE_TTL_MS) {
      return json(request, {
        rate_usdt: previousRate,
        fetched_at: fetchedAt?.toISOString() ?? null,
        age_seconds: Math.floor(ageMs / 1000),
        stale: false,
        sources: cached?.sources ?? null,
      })
    }

    // Poll every venue; one slow or broken venue must not sink the rest.
    const readings = await Promise.allSettled(
      VENUES.map(async (venue) => {
        const response = await fetch(venue.url, {
          headers: { accept: 'application/json' },
          signal: AbortSignal.timeout(8_000),
        })
        if (!response.ok) {
          throw new Error(`${venue.name} returned ${response.status}`)
        }
        const rate = venue.parse(await response.json())
        if (rate === null) throw new Error(`${venue.name} returned no usable price`)
        return { name: venue.name, rate }
      }),
    )

    const sources: Record<string, number | string> = {}
    const rates: number[] = []

    readings.forEach((reading, index) => {
      const name = VENUES[index].name
      if (reading.status === 'fulfilled') {
        sources[name] = reading.value.rate
        rates.push(reading.value.rate)
      } else {
        sources[name] =
          reading.reason instanceof Error ? reading.reason.message : 'failed'
      }
    })

    const rate = medianRate(rates)

    if (rate === null) {
      // Nothing usable. Hand back the last known rate, flagged, rather than
      // failing the request — the UI degrades by hiding, not by guessing.
      if (previousRate && Number.isFinite(previousRate)) {
        return json(request, {
          rate_usdt: previousRate,
          fetched_at: fetchedAt?.toISOString() ?? null,
          age_seconds: fetchedAt ? Math.floor(ageMs / 1000) : null,
          stale: true,
          sources,
        })
      }
      return errorResponse(request, 'No price source is reachable.', 503)
    }

    if (!isPlausibleRate(rate, previousRate)) {
      console.error('nim-price: implausible rate rejected', rate, previousRate)
      return json(request, {
        rate_usdt: previousRate,
        fetched_at: fetchedAt?.toISOString() ?? null,
        age_seconds: fetchedAt ? Math.floor(ageMs / 1000) : null,
        stale: true,
        sources,
      })
    }

    const now = new Date().toISOString()

    const { error: writeError } = await supabase
      .from('nim_price_cache')
      .upsert({ id: true, rate_usdt: rate, fetched_at: now, sources })

    if (writeError) console.error('nim-price: cache write failed', writeError)

    return json(request, {
      rate_usdt: rate,
      fetched_at: now,
      age_seconds: 0,
      stale: false,
      sources,
    })
  } catch (error) {
    console.error('nim-price failed', error)
    return errorResponse(
      request,
      error instanceof Error ? error.message : 'Unexpected error',
      500,
    )
  }
})
