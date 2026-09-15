import { POLYGON_CHAIN_ID_HEX, POLYGON_CHAIN_PARAMS } from './chains'
import {
  CHAIN_NOT_ADDED_CODE,
  PROVIDER_UNAVAILABLE_CODE,
  ProviderError,
  toProviderError,
} from './errors'

export interface EthereumProvider {
  request(args: {
    method: string
    params?: unknown[] | Record<string, unknown>
  }): Promise<unknown>
  on?(event: string, handler: (...args: unknown[]) => void): void
  removeListener?(event: string, handler: (...args: unknown[]) => void): void
}

export function getEthereumProvider(): EthereumProvider | null {
  if (typeof window === 'undefined') return null
  return window.ethereum ?? null
}

export function hasEthereumProvider(): boolean {
  return getEthereumProvider() !== null
}

function provider(): EthereumProvider {
  const injected = getEthereumProvider()
  if (!injected) {
    throw new ProviderError(
      'Wallet provider not found. Open ParkPilot inside Nimiq Pay.',
      PROVIDER_UNAVAILABLE_CODE,
    )
  }
  return injected
}

async function request<T>(
  args: {
    method: string
    params?: unknown[] | Record<string, unknown>
  },
): Promise<T> {
  try {
    return (await provider().request(args)) as T
  } catch (error) {
    throw toProviderError(error)
  }
}

export async function requestAccounts(): Promise<string[]> {
  const accounts = await request<string[]>({ method: 'eth_requestAccounts' })
  return accounts ?? []
}

export async function getAccounts(): Promise<string[]> {
  const accounts = await request<string[]>({ method: 'eth_accounts' })
  return accounts ?? []
}

export async function getChainId(): Promise<string> {
  return request<string>({ method: 'eth_chainId' })
}

export async function getNativeBalance(address: string): Promise<bigint> {
  const value = await request<string>({
    method: 'eth_getBalance',
    params: [address, 'latest'],
  })
  return BigInt(value)
}

export async function callContract(
  tx: { to: string; data: string },
  block = 'latest',
): Promise<string> {
  return request<string>({ method: 'eth_call', params: [tx, block] })
}

export async function estimateGas(
  tx: Record<string, unknown>,
): Promise<bigint> {
  const value = await request<string>({
    method: 'eth_estimateGas',
    params: [tx],
  })
  return BigInt(value)
}

export async function sendTransaction(
  tx: Record<string, unknown>,
): Promise<string> {
  return request<string>({ method: 'eth_sendTransaction', params: [tx] })
}

/** Sign EIP-712 typed data (presents a readable breakdown in Nimiq Pay). */
export async function signTypedData(
  address: string,
  typedData: unknown,
): Promise<string> {
  return request<string>({
    method: 'eth_signTypedData_v4',
    params: [address, JSON.stringify(typedData)],
  })
}

export async function getTransactionReceipt(
  hash: string,
): Promise<unknown | null> {
  return request<unknown | null>({
    method: 'eth_getTransactionReceipt',
    params: [hash],
  })
}

export async function switchToPolygon(): Promise<void> {
  try {
    await request<null>({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: POLYGON_CHAIN_ID_HEX }],
    })
  } catch (error) {
    const providerError = toProviderError(error)
    if (providerError.code === CHAIN_NOT_ADDED_CODE) {
      await request<null>({
        method: 'wallet_addEthereumChain',
        params: [POLYGON_CHAIN_PARAMS],
      })
      return
    }
    throw providerError
  }
}

export async function ensurePolygon(): Promise<void> {
  const current = await getChainId()
  if (current.toLowerCase() === POLYGON_CHAIN_ID_HEX.toLowerCase()) return

  await switchToPolygon()

  const after = await getChainId()
  if (after.toLowerCase() !== POLYGON_CHAIN_ID_HEX.toLowerCase()) {
    throw new ProviderError(
      'Please switch to the Polygon network to continue.',
    )
  }
}
