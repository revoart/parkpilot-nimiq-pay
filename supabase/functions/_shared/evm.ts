/** keccak256("Transfer(address,address,uint256)") */
export const TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'

export interface RpcLog {
  address: string
  topics: string[]
  data: string
}

export interface RpcReceipt {
  status: string
  blockNumber: string
  from: string
  to: string | null
  logs: RpcLog[]
}

export async function rpc<T>(
  rpcUrl: string,
  method: string,
  params: unknown[] = [],
): Promise<T> {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })

  if (!response.ok) {
    throw new Error(`RPC request failed with status ${response.status}`)
  }

  const payload = (await response.json()) as {
    result?: T
    error?: { message?: string }
  }

  if (payload.error) throw new Error(payload.error.message ?? 'RPC error')
  if (payload.result === undefined) throw new Error('RPC returned no result')
  return payload.result
}

export function normalizeAddress(value: string): string {
  return value.toLowerCase()
}

export function isValidEvmAddress(value: unknown): value is string {
  return typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value)
}

export function topicToAddress(topic: string): string {
  if (!/^0x[0-9a-fA-F]{64}$/.test(topic)) {
    throw new Error('Malformed address topic in transfer log')
  }
  return normalizeAddress(`0x${topic.slice(26)}`)
}

/** Decimal string -> raw integer units, without floating point. */
export function decimalToRaw(
  value: string | number,
  decimals: number,
): bigint {
  const text = String(value).trim()
  if (!/^\d+(\.\d+)?$/.test(text)) {
    throw new Error(`Invalid decimal amount: ${text}`)
  }
  const [whole, fraction = ''] = text.split('.')
  const padded = (fraction + '0'.repeat(decimals)).slice(0, decimals)
  return BigInt(`${whole}${padded}`)
}

/** Raw integer units -> decimal string, without floating point. */
export function rawToDecimal(raw: bigint, decimals: number): string {
  const negative = raw < 0n
  const value = negative ? -raw : raw
  const base = 10n ** BigInt(decimals)
  const whole = value / base
  const fraction = (value % base).toString().padStart(decimals, '0')
  const trimmed = fraction.replace(/0+$/, '')
  const result = trimmed ? `${whole}.${trimmed}` : `${whole}`
  return negative ? `-${result}` : result
}

export interface TransferMatch {
  from: string
  to: string
  value: bigint
}

/**
 * Find the first ERC-20 Transfer log matching token contract, sender and
 * recipient. Returns null when no matching transfer exists.
 */
export function findTransfer(
  receipt: RpcReceipt,
  tokenContract: string,
  expectedFrom: string,
  expectedTo: string,
): TransferMatch | null {
  const contract = normalizeAddress(tokenContract)
  const from = normalizeAddress(expectedFrom)
  const to = normalizeAddress(expectedTo)

  for (const log of receipt.logs ?? []) {
    if (normalizeAddress(log.address) !== contract) continue
    if (!log.topics || log.topics.length !== 3) continue
    if (log.topics[0].toLowerCase() !== TRANSFER_TOPIC) continue

    const logFrom = topicToAddress(log.topics[1])
    const logTo = topicToAddress(log.topics[2])
    if (logFrom !== from || logTo !== to) continue

    return { from: logFrom, to: logTo, value: BigInt(log.data) }
  }

  return null
}
