import { useCallback, useState } from 'react'

import {
  isInsideNimiqPay,
  listNimiqAccounts,
  signWithNimiq,
  type NimiqSignResult,
} from '@/lib/nimiq'

interface UseNimiqResult {
  insideNimiqPay: boolean
  accounts: string[] | null
  signature: NimiqSignResult | null
  loading: boolean
  error: string | null
  connect: () => Promise<string[] | null>
  sign: (message: string) => Promise<NimiqSignResult | null>
  reset: () => void
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Secondary, non-blocking Nimiq identity flow. Never used for payments — the
 * payment flow uses the EVM provider. Errors here must not affect parking or
 * payment.
 */
export function useNimiq(): UseNimiqResult {
  const [accounts, setAccounts] = useState<string[] | null>(null)
  const [signature, setSignature] = useState<NimiqSignResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const connect = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await listNimiqAccounts()
      if (!result.length) throw new Error('No Nimiq account was returned.')
      setAccounts(result)
      return result
    } catch (err) {
      setError(message(err))
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  const sign = useCallback(async (text: string) => {
    setLoading(true)
    setError(null)
    try {
      const result = await signWithNimiq(text)
      setSignature(result)
      return result
    } catch (err) {
      setError(message(err))
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  const reset = useCallback(() => {
    setAccounts(null)
    setSignature(null)
    setError(null)
  }, [])

  return {
    insideNimiqPay: isInsideNimiqPay(),
    accounts,
    signature,
    loading,
    error,
    connect,
    sign,
    reset,
  }
}
