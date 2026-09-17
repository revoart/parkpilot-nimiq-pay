import { useCallback, useEffect, useState } from 'react'

import { listTransactions, type TransactionEntry } from '@/lib/transactions'

/**
 * The signed-in account's activity feed.
 *
 * Loads whenever an address is present and reloads when it changes. An error is
 * kept rather than swallowed so the screen can say the feed is unavailable
 * instead of implying the account has no activity.
 */
export function useTransactions(address: string | null, limit?: number) {
  const [transactions, setTransactions] = useState<TransactionEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!address) {
      setTransactions([])
      setError(null)
      return
    }

    setLoading(true)
    setError(null)
    try {
      setTransactions(await listTransactions(address, limit))
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not load your activity.',
      )
    } finally {
      setLoading(false)
    }
  }, [address, limit])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { transactions, loading, error, refresh }
}
