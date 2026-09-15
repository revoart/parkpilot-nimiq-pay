import { createClient } from 'npm:@supabase/supabase-js@2'

import { readToken, verifyToken } from '../_shared/auth.ts'
import { errorResponse, json, preflight } from '../_shared/http.ts'

function startOfDay(date: Date): Date {
  const copy = new Date(date)
  copy.setHours(0, 0, 0, 0)
  return copy
}

/**
 * Host earnings read from the internal ledger (net of the platform fee),
 * never from gross payment rows.
 */
Deno.serve(async (request) => {
  const options = preflight(request)
  if (options) return options
  if (request.method !== 'POST') {
    return errorResponse(request, 'Method not allowed', 405)
  }

  try {
    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >

    const owner = await verifyToken(readToken(request, body))
    if (!owner) {
      return errorResponse(
        request,
        'Sign in with your wallet to continue.',
        401,
      )
    }

    const empty = {
      total: 0,
      today: 0,
      week: 0,
      month: 0,
      allTime: 0,
      series: [] as { date: string; amount: number }[],
      currency: 'USDT',
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: account } = await supabase
      .from('ledger_accounts')
      .select('id')
      .eq('owner_type', 'host')
      .ilike('owner_address', owner)
      .eq('currency', 'USDT')
      .maybeSingle()

    if (!account) return json(request, empty)

    const { data: entries, error } = await supabase
      .from('ledger_entries')
      .select('entry_type, direction, amount_usdt, created_at')
      .eq('account_id', account.id)
      .eq('entry_type', 'earning')
      .eq('direction', 'credit')

    if (error) throw error

    const now = new Date()
    const todayStart = startOfDay(now).getTime()
    const weekStart = todayStart - 6 * 86_400_000
    const monthStart = todayStart - 29 * 86_400_000
    const seriesStart = todayStart - 13 * 86_400_000

    let today = 0
    let week = 0
    let month = 0
    let allTime = 0
    const dayTotals = new Map<string, number>()

    for (const entry of entries ?? []) {
      const amount = Number(entry.amount_usdt)
      if (!Number.isFinite(amount)) continue
      const when = new Date(entry.created_at as string).getTime()

      allTime += amount
      if (when >= todayStart) today += amount
      if (when >= weekStart) week += amount
      if (when >= monthStart) month += amount

      if (when >= seriesStart) {
        const key = new Date(when).toISOString().slice(0, 10)
        dayTotals.set(key, (dayTotals.get(key) ?? 0) + amount)
      }
    }

    const series: { date: string; amount: number }[] = []
    for (let i = 13; i >= 0; i -= 1) {
      const day = new Date(todayStart - i * 86_400_000)
      const key = day.toISOString().slice(0, 10)
      series.push({
        date: key,
        amount: Number((dayTotals.get(key) ?? 0).toFixed(2)),
      })
    }

    const round = (value: number) => Number(value.toFixed(2))

    return json(request, {
      total: round(allTime),
      today: round(today),
      week: round(week),
      month: round(month),
      allTime: round(allTime),
      series,
      currency: 'USDT',
    })
  } catch (error) {
    console.error('host-earnings failed', error)
    return errorResponse(
      request,
      error instanceof Error ? error.message : 'Unexpected error',
      500,
    )
  }
})
