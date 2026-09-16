import { useCallback, useEffect, useState } from 'react'

import { fetchNimBalance } from '@/lib/nimiq/service'

/**
 * The NIM balance of a Nimiq account.
 *
 * Read from the Nimiq chain, not from the wallet's EVM provider — NIM is a
 * different network. Returns null when the balance cannot be read (outside
 * Nimiq Pay, or the node is unreachable) so callers show a dash rather than a
 * number we cannot stand behind.
 */
export function useNimBalance(address: string | null) {
  const [balanceLuna, setBalanceLuna] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (!address) {
      setBalanceLuna(null)
      return
    }

    setLoading(true)
    try {
      const result = await fetchNimBalance(address)
      setBalanceLuna(result.balance_luna)
    } catch {
      setBalanceLuna(null)
    } finally {
      setLoading(false)
    }
  }, [address])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { balanceLuna, loading, refresh }
}
