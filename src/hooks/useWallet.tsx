import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import { trackEvent } from '@/lib/analytics/events'
import { clearAuthToken } from '@/lib/auth'
import { isInsideNimiqPay, listNimiqAccounts } from '@/lib/nimiq'

/**
 * The connected Nimiq account.
 *
 * Nimiq is the only rail now: there is no EVM wallet, no chain to switch to and
 * no gas token to hold. Connecting asks Nimiq Pay to share the account, which
 * shows the user a native approval dialog — so this never runs unprompted on
 * load. The account is remembered for the session instead, and the user can
 * disconnect to clear it.
 */

export type WalletStatus =
  | 'unavailable'
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error'

interface WalletContextValue {
  /** Whether the app is running inside Nimiq Pay. */
  providerAvailable: boolean
  status: WalletStatus
  /** The Nimiq account address, e.g. `NQ94 FAH0 YLHQ S40D 5B2U XUDR L6XG 3GYU 2JEX`. */
  address: string | null
  error: string | null
  connect: () => Promise<void>
  disconnect: () => void
}

const WalletContext = createContext<WalletContextValue | null>(null)

const ADDRESS_KEY = 'parkpilot.nimiq-account'

function readStoredAddress(): string | null {
  try {
    return sessionStorage.getItem(ADDRESS_KEY)
  } catch {
    return null
  }
}

function storeAddress(address: string | null): void {
  try {
    if (address) sessionStorage.setItem(ADDRESS_KEY, address)
    else sessionStorage.removeItem(ADDRESS_KEY)
  } catch {
    // A full or unavailable session store is not worth failing a connection for.
  }
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [providerAvailable, setProviderAvailable] = useState(false)
  const [status, setStatus] = useState<WalletStatus>('disconnected')
  const [address, setAddress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const inside = isInsideNimiqPay()
    setProviderAvailable(inside)

    if (!inside) {
      setStatus('unavailable')
      return
    }

    // Restore the session without re-prompting. The wallet is the authority on
    // which account is active; this only avoids a second approval dialog on a
    // reload within the same session.
    const stored = readStoredAddress()
    if (stored) {
      setAddress(stored)
      setStatus('connected')
    }
  }, [])

  const connect = useCallback(async () => {
    setError(null)

    if (!isInsideNimiqPay()) {
      setStatus('unavailable')
      setError('Open ParkPilot inside Nimiq Pay to connect your account.')
      return
    }

    setStatus('connecting')
    try {
      const accounts = await listNimiqAccounts()
      const account = accounts[0]
      if (!account) throw new Error('No Nimiq account was returned.')

      setAddress(account)
      storeAddress(account)
      setStatus('connected')
      void trackEvent('wallet_connected', { evmAddress: account })
      // Sign-in is requested lazily by the first write, so connecting shows only
      // the connect prompt — never a second prompt straight after.
    } catch (err) {
      // Nimiq Pay reports a declined approval as a permission error.
      const text = err instanceof Error ? err.message : ''
      if (/denied|reject|cancel|permission/i.test(text)) {
        setStatus('disconnected')
        setError('Request cancelled.')
      } else {
        setStatus('error')
        setError(text || 'Could not connect your Nimiq account.')
      }
    }
  }, [])

  const disconnect = useCallback(() => {
    clearAuthToken()
    storeAddress(null)
    setAddress(null)
    setError(null)
    setStatus(isInsideNimiqPay() ? 'disconnected' : 'unavailable')
  }, [])

  const value = useMemo<WalletContextValue>(
    () => ({
      providerAvailable,
      status,
      address,
      error,
      connect,
      disconnect,
    }),
    [providerAvailable, status, address, error, connect, disconnect],
  )

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}

export function useWallet(): WalletContextValue {
  const context = useContext(WalletContext)
  if (!context) {
    throw new Error('useWallet must be used within a WalletProvider.')
  }
  return context
}
