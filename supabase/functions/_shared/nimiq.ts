/**
 * Nimiq JSON-RPC client for edge functions.
 *
 * Every response from a Nimiq node is wrapped as `{ result: { data, metadata } }`,
 * and the envelope differs from a conventional JSON-RPC node — this module
 * unwraps it so callers only see `data`.
 *
 * Deliberately dependency-free (like `./evm.ts`) so it can be unit tested.
 */

/** Nimiq Albatross network IDs. Mainnet is 24, not the 42 used by old PoW. */
export const NIMIQ_MAINNET_ID = 24
export const NIMIQ_TESTNET_ID = 5

export const DEFAULT_NIMIQ_RPC_ENDPOINTS = ['https://rpc.nimiqwatch.com']

/** Nimiq's base32 alphabet. I, O, W and Z are not used. */
const NIMIQ_ALPHABET = '0123456789ABCDEFGHJKLMNPQRSTUVXY'

const COUNTRY_CODE = 'NQ'
const ADDRESS_LENGTH = 36

export interface NimiqTransaction {
  hash: string
  blockNumber: number
  timestamp: number
  confirmations: number
  from: string
  to: string
  value: number
  fee: number
  validityStartHeight: number
  networkId: number
  executionResult: boolean
}

export interface NimiqAccount {
  address: string
  /** Balance in Luna. */
  balance: number
  type: string
}

/** Raised for any JSON-RPC error other than "not found". */
export class NimiqRpcError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NimiqRpcError'
  }
}

function ibanChecksum(stripped: string): number {
  const rearranged = stripped.slice(4) + stripped.slice(0, 4)
  let remainder = 0

  for (const char of rearranged) {
    const code = char.charCodeAt(0)
    const value = code >= 65 ? code - 55 : code - 48
    remainder = value >= 10
      ? (remainder * 100 + value) % 97
      : (remainder * 10 + value) % 97
  }

  return remainder
}

/** Canonical comparison form: stripped and uppercase. */
export function normalizeNimiqAddress(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase()
}

export function isValidNimiqAddress(value: unknown): value is string {
  if (typeof value !== 'string') return false

  const stripped = normalizeNimiqAddress(value)
  if (stripped.length !== ADDRESS_LENGTH) return false
  if (!stripped.startsWith(COUNTRY_CODE)) return false

  for (const char of stripped.slice(COUNTRY_CODE.length)) {
    if (!NIMIQ_ALPHABET.includes(char)) return false
  }

  return ibanChecksum(stripped) === 1
}

export function nimiqAddressesEqual(a: string, b: string): boolean {
  if (!isValidNimiqAddress(a) || !isValidNimiqAddress(b)) return false
  return normalizeNimiqAddress(a) === normalizeNimiqAddress(b)
}

/** Endpoints from `NIMIQ_RPC_ENDPOINTS` (comma separated), else the default. */
export function resolveNimiqEndpoints(): string[] {
  const raw = typeof Deno !== 'undefined'
    ? Deno.env.get('NIMIQ_RPC_ENDPOINTS')
    : undefined

  const configured = (raw ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)

  return configured.length > 0 ? configured : DEFAULT_NIMIQ_RPC_ENDPOINTS
}

interface RpcEnvelope<T> {
  result?: { data?: T }
  error?: { code?: number; message?: string; data?: unknown }
}

/**
 * Call a Nimiq RPC method, trying each endpoint until one answers.
 *
 * A missing transaction surfaces from Nimiq as an error rather than an empty
 * result, so `notFoundIsNull` turns that specific case into `null`. Callers
 * verifying a payment need to distinguish "not mined yet" (keep polling) from
 * "the node is broken" (stop and stay unconfirmed).
 */
export async function nimiqRpc<T>(
  method: string,
  params: unknown[] = [],
  options: { endpoints?: string[]; notFoundIsNull?: boolean } = {},
): Promise<T | null> {
  const endpoints = options.endpoints ?? resolveNimiqEndpoints()
  let lastError: Error | null = null

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        signal: AbortSignal.timeout(15_000),
      })

      if (!response.ok) {
        lastError = new NimiqRpcError(
          `${method} failed with status ${response.status}`,
        )
        continue
      }

      const payload = (await response.json()) as RpcEnvelope<T>

      if (payload.error) {
        const message = payload.error.message ?? 'RPC error'
        const detail = typeof payload.error.data === 'string' ? payload.error.data : ''
        const combined = `${message} ${detail}`

        if (options.notFoundIsNull && /not found/i.test(combined)) return null
        lastError = new NimiqRpcError(combined.trim())
        continue
      }

      return (payload.result?.data ?? null) as T | null
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
    }
  }

  throw lastError ?? new NimiqRpcError(`${method} failed on every endpoint`)
}

/** Fetch a transaction, or null when the node has not seen it. */
export async function getNimiqTransaction(
  hash: string,
  endpoints?: string[],
): Promise<NimiqTransaction | null> {
  const cleaned = hash.replace(/^0x/i, '').toLowerCase()
  if (!/^[0-9a-f]{64}$/.test(cleaned)) {
    throw new NimiqRpcError('Transaction hashes are 32 bytes of hex.')
  }

  return await nimiqRpc<NimiqTransaction>('getTransactionByHash', [cleaned], {
    endpoints,
    notFoundIsNull: true,
  })
}

/** Fetch an account, or null when the address has no on-chain state. */
export async function getNimiqAccount(
  address: string,
  endpoints?: string[],
): Promise<NimiqAccount | null> {
  if (!isValidNimiqAddress(address)) {
    throw new NimiqRpcError('Invalid Nimiq address.')
  }

  return await nimiqRpc<NimiqAccount>(
    'getAccountByAddress',
    [normalizeNimiqAddress(address)],
    { endpoints, notFoundIsNull: true },
  )
}

/** Broadcast a signed, serialized transaction. Returns the transaction hash. */
export async function sendNimiqRawTransaction(
  serializedHex: string,
  endpoints?: string[],
): Promise<string> {
  const cleaned = serializedHex.replace(/^0x/i, '')
  if (!/^[0-9a-fA-F]+$/.test(cleaned)) {
    throw new NimiqRpcError('Serialized transactions must be hex.')
  }

  const hash = await nimiqRpc<string>('sendRawTransaction', [cleaned], { endpoints })
  if (!hash) throw new NimiqRpcError('Broadcast returned no transaction hash.')
  return hash
}

export async function isNimiqConsensusEstablished(
  endpoints?: string[],
): Promise<boolean> {
  return Boolean(await nimiqRpc<boolean>('isConsensusEstablished', [], { endpoints }))
}

/** Current block height. Used to compute a transaction's validity window. */
export async function getNimiqBlockNumber(endpoints?: string[]): Promise<number> {
  const height = await nimiqRpc<number>('getBlockNumber', [], { endpoints })
  if (typeof height !== 'number') throw new NimiqRpcError('No block height returned.')
  return height
}
