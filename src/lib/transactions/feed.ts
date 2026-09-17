import { lunaToNim } from '@/lib/nimiq/amounts'

/**
 * One row of the unified activity feed.
 *
 * `amount_nim` is the decimal the server sent for transport; `amount_raw` is the
 * exact on-chain Luna integer and is the value every display derives from. The
 * two are never added together or combined across entries — each row stands on
 * its own.
 */
export type TransactionType = 'parking_payment' | 'host_revenue'
export type TransactionDirection = 'debit' | 'credit'

export interface TransactionEntry {
  type: TransactionType
  tx_hash: string | null
  amount_nim: number
  amount_raw: string
  direction: TransactionDirection
  status: string | null
  label: string
  created_at: string
}

/**
 * Newest first. Ties keep their existing order, and an unparseable timestamp
 * sorts to the end rather than poisoning the whole comparison.
 */
export function sortTransactions(
  entries: TransactionEntry[],
): TransactionEntry[] {
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => {
      const left = Date.parse(a.entry.created_at)
      const right = Date.parse(b.entry.created_at)
      const leftValid = !Number.isNaN(left)
      const rightValid = !Number.isNaN(right)

      if (!leftValid && !rightValid) return a.index - b.index
      if (!leftValid) return 1
      if (!rightValid) return -1
      if (right !== left) return right - left
      return a.index - b.index
    })
    .map(({ entry }) => entry)
}

const TITLE_PREFIX: Record<TransactionType, string> = {
  parking_payment: 'Parking payment',
  host_revenue: 'Host earnings',
}

/** The human label: "Parking payment · Nice parking" / "Host earnings · …". */
export function transactionTitle(entry: TransactionEntry): string {
  return `${TITLE_PREFIX[entry.type]} · ${entry.label}`
}

/**
 * The exact NIM amount for display, derived from the Luna integer so no float
 * rounding creeps in. Falls back to the transported decimal only if the raw
 * value cannot be parsed.
 */
export function transactionAmountNim(entry: TransactionEntry): string {
  try {
    return lunaToNim(BigInt(entry.amount_raw))
  } catch {
    return String(entry.amount_nim)
  }
}

/** `-` for money out (a driver payment), `+` for money in (host earnings). */
export function transactionSign(entry: TransactionEntry): '+' | '-' {
  return entry.direction === 'credit' ? '+' : '-'
}
