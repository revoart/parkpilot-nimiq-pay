import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { formatUnits } from 'viem'

import { trackEvent } from '@/lib/analytics/events'
import { clearAuthToken } from '@/lib/auth'
import { POLYGON_CHAIN_ID_HEX } from '@/lib/ethereum/chains'
import {
  isUserRejection,
  userFacingWalletError,
} from '@/lib/ethereum/errors'
import * as ethereum from '@/lib/ethereum/provider'
import { readUsdtBalance } from '@/lib/usdt'

export type WalletStatus =
  | 'unavailable'
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'wrong_network'
  | 'error'

interface WalletContextValue {
  providerAvailable: boolean
  status: WalletStatus
  address: string | null
  chainId: string | null
  onPolygon: boolean
  usdtBalance: string | null
  polBalance: string | null
  error: string | null
  connect: () => Promise<void>
  refreshBalances: () => Promise<void>
  disconnect: () => void
}

const WalletContext = createContext<WalletContextValue | null>(null)

export function WalletProvider({ children }: { children: ReactNode }) {
  const [providerAvailable, setProviderAvailable] = useState(false)
  const [status, setStatus] = useState<WalletStatus>('disconnected')
  const [address, setAddress] = useState<string | null>(null)
  const [chainId, setChainId] = useState<string | null>(null)
  const [usdtBalance, setUsdtBalance] = useState<string | null>(null)
  const [polBalance, setPolBalance] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const onPolygon =
    chainId?.toLowerCase() === POLYGON_CHAIN_ID_HEX.toLowerCase()

  useEffect(() => {
    const available = ethereum.hasEthereumProvider()
    setProviderAvailable(available)
    if (!available) setStatus('unavailable')

    if (available) {
      // Restore the session fully: an already-authorised wallet must also report
      // its chain, otherwise the UI shows "wrong network" until the user
      // reconnects manually even though it is already on Polygon.
      void Promise.all([ethereum.getAccounts(), ethereum.getChainId()])
        .then(([accounts, currentChain]) => {
          if (!accounts.length) return
          setAddress(accounts[0])
          setChainId(currentChain)
          setStatus(
            currentChain.toLowerCase() === POLYGON_CHAIN_ID_HEX.toLowerCase()
              ? 'connected'
              : 'wrong_network',
          )
        })
        .catch(() => undefined)
    }
  }, [])

  const refreshBalances = useCallback(async () => {
    if (!address) return
    try {
      const [usdt, pol] = await Promise.all([
        readUsdtBalance(address),
        ethereum.getNativeBalance(address),
      ])
      setUsdtBalance(usdt)
      setPolBalance(formatUnits(pol, 18))
    } catch {
      // A failed balance read should not break the connection.
    }
  }, [address])

  useEffect(() => {
    if (address) void refreshBalances()
  }, [address, refreshBalances])

  const connect = useCallback(async () => {
    setError(null)

    if (!ethereum.hasEthereumProvider()) {
      setStatus('unavailable')
      setError('Open ParkPilot inside Nimiq Pay to connect your wallet.')
      return
    }

    setStatus('connecting')
    try {
      const accounts = await ethereum.requestAccounts()
      if (!accounts.length) throw new Error('No wallet account was returned.')
      const account = accounts[0]

      await ethereum.ensurePolygon()
      const currentChain = await ethereum.getChainId()

      setAddress(account)
      setChainId(currentChain)
      setStatus(
        currentChain.toLowerCase() === POLYGON_CHAIN_ID_HEX.toLowerCase()
          ? 'connected'
          : 'wrong_network',
      )
      void trackEvent('wallet_connected', { evmAddress: account })
      // Wallet sign-in (EIP-712) is requested lazily by the first write, so
      // connecting shows only the connect prompt — never a second sign prompt.
    } catch (err) {
      if (isUserRejection(err)) {
        setStatus('disconnected')
        setError('Request cancelled.')
      } else {
        setStatus('error')
        setError(userFacingWalletError(err))
      }
    }
  }, [])

  const disconnect = useCallback(() => {
    clearAuthToken()
    setAddress(null)
    setChainId(null)
    setUsdtBalance(null)
    setPolBalance(null)
    setError(null)
    setStatus(ethereum.hasEthereumProvider() ? 'disconnected' : 'unavailable')
  }, [])

  const value = useMemo<WalletContextValue>(
    () => ({
      providerAvailable,
      status,
      address,
      chainId,
      onPolygon: Boolean(onPolygon),
      usdtBalance,
      polBalance,
      error,
      connect,
      refreshBalances,
      disconnect,
    }),
    [
      providerAvailable,
      status,
      address,
      chainId,
      onPolygon,
      usdtBalance,
      polBalance,
      error,
      connect,
      refreshBalances,
      disconnect,
    ],
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
