import { createClient } from 'npm:@supabase/supabase-js@2'

import { readToken, verifyToken } from '../_shared/auth.ts'
import { errorResponse, json, preflight } from '../_shared/http.ts'

/**
 * A unified activity feed for the signed-in account.
 *
 * Two independent sources, both keyed by the acting account:
 *
 *   * payments the account made as a driver (money out), read from `payments`
 *     through the reservation that names the account as its payer;
 *   * host earnings the account accrued as a host (money in), read from the
 *     internal ledger — the accounting attribution, not a wallet.
 *
 * The two are merged into one chronological list. They are never summed: a
 * driver payment and a host credit are different economic events, and the
 * on-chain balance is a third thing again.
 */

interface FeedEntry {
  type: 'parking_payment' | 'host_revenue'
  tx_hash: string | null
  amount_nim: number
  amount_raw: string
  direction: 'debit' | 'credit'
  status: string | null
  label: string
  created_at: string
}

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

/** Optional `limit`, defaulting to 50 and clamped to 1..200. */
function clampLimit(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT
  return Math.max(1, Math.min(MAX_LIMIT, Math.trunc(parsed)))
}

/** PostgREST returns a to-one embed as an object, but as an array if it guesses many. */
function first<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

function titleOf(reservation: Record<string, unknown> | null): string {
  const space = first(
    reservation?.parking_spaces as
      | Record<string, unknown>
      | Record<string, unknown>[]
      | undefined,
  )
  const title = space?.title
  return typeof title === 'string' && title.trim() ? title : 'Parking space'
}

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

    // The acting account is the token identity, never the request body.
    const owner = await verifyToken(readToken(request, body))
    if (!owner) {
      return errorResponse(request, 'Sign in with your wallet to continue.', 401)
    }

    const limit = clampLimit(body.limit)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // 1. Payments the account made as a driver — money out.
    const { data: paymentRows, error: paymentError } = await supabase
      .from('payments')
      .select(
        'tx_hash, amount_nim, amount_raw, status, confirmed_at, created_at, sender_address, recipient_address, reservations!inner ( nimiq_address, parking_spaces ( title ) )',
      )
      .eq('reservations.nimiq_address', owner)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (paymentError) throw paymentError

    const payments: FeedEntry[] = (paymentRows ?? []).map((row) => {
      const record = row as unknown as Record<string, unknown>
      const reservation = first(
        record.reservations as
          | Record<string, unknown>
          | Record<string, unknown>[]
          | null,
      )
      return {
        type: 'parking_payment',
        tx_hash: (record.tx_hash as string | null) ?? null,
        amount_nim: Number(record.amount_nim ?? 0),
        amount_raw: String(record.amount_raw ?? '0'),
        direction: 'debit',
        status: (record.status as string | null) ?? null,
        label: titleOf(reservation),
        created_at: String(record.created_at ?? ''),
      }
    })

    // 2. Host earnings the account accrued — money in, from the ledger.
    const { data: earningRows, error: earningError } = await supabase
      .from('ledger_entries')
      .select(
        'amount_nim, amount_raw, created_at, reservation_id, payment_id, ledger_accounts!inner ( owner_type, owner_address ), payments ( tx_hash ), reservations ( parking_spaces ( title ) )',
      )
      .eq('entry_type', 'earning')
      .eq('ledger_accounts.owner_type', 'host')
      .ilike('ledger_accounts.owner_address', owner)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (earningError) throw earningError

    const earnings: FeedEntry[] = (earningRows ?? []).map((row) => {
      const record = row as unknown as Record<string, unknown>
      const payment = first(
        record.payments as
          | Record<string, unknown>
          | Record<string, unknown>[]
          | null,
      )
      const reservation = first(
        record.reservations as
          | Record<string, unknown>
          | Record<string, unknown>[]
          | null,
      )
      return {
        type: 'host_revenue',
        tx_hash: (payment?.tx_hash as string | null) ?? null,
        amount_nim: Number(record.amount_nim ?? 0),
        amount_raw: String(record.amount_raw ?? '0'),
        direction: 'credit',
        status: null,
        label: titleOf(reservation),
        created_at: String(record.created_at ?? ''),
      }
    })

    const transactions = [...payments, ...earnings]
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      )
      .slice(0, limit)

    // Nothing invented: an account with no activity gets an empty array.
    return json(request, transactions)
  } catch (error) {
    console.error('list-transactions failed', error)
    return errorResponse(
      request,
      error instanceof Error ? error.message : 'Unexpected error',
      500,
    )
  }
})
