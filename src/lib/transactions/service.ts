import { requireToken } from '@/lib/auth'
import { getSupabase } from '@/lib/supabase/client'
import { readFunctionError } from '@/lib/supabase/functions'

import { sortTransactions, type TransactionEntry } from './feed'

export type { TransactionEntry }

function normalize(row: Record<string, unknown>): TransactionEntry {
  return {
    type: row.type === 'host_revenue' ? 'host_revenue' : 'parking_payment',
    tx_hash: (row.tx_hash as string | null) ?? null,
    amount_nim: Number(row.amount_nim ?? 0),
    amount_raw: String(row.amount_raw ?? '0'),
    direction: row.direction === 'credit' ? 'credit' : 'debit',
    status: (row.status as string | null) ?? null,
    label:
      typeof row.label === 'string' && row.label.trim()
        ? row.label
        : 'Parking space',
    created_at: String(row.created_at ?? ''),
  }
}

/**
 * The signed-in account's activity feed.
 *
 * The acting account comes from the session token, never the address argument —
 * the address is only what `requireToken` signs in with. The feed mixes driver
 * payments (money out) and host earnings (money in) in one chronology.
 */
export async function listTransactions(
  address: string,
  limit?: number,
): Promise<TransactionEntry[]> {
  const supabase = getSupabase()
  const authToken = await requireToken(address)

  const body: Record<string, unknown> = { auth_token: authToken }
  if (limit !== undefined) body.limit = limit

  const { data, error } = await supabase.functions.invoke('list-transactions', {
    body,
  })

  if (error) {
    throw new Error(
      await readFunctionError(error, 'Could not load your activity.'),
    )
  }

  const payload = data as
    | Record<string, unknown>[]
    | { error?: string }
    | null

  if (!Array.isArray(payload)) {
    throw new Error(
      (payload as { error?: string } | null)?.error ??
        'Could not load your activity.',
    )
  }

  return sortTransactions(payload.map(normalize))
}
