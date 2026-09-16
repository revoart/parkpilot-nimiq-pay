import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_NIMIQ_RPC_ENDPOINTS,
  NIMIQ_MAINNET_ID,
  NIMIQ_TESTNET_ID,
  NimiqRpcError,
  getNimiqAccount,
  getNimiqBlockNumber,
  getNimiqTransaction,
  isNimiqConsensusEstablished,
  isValidNimiqAddress,
  nimiqAddressesEqual,
  normalizeNimiqAddress,
  resolveNimiqEndpoints,
  sendNimiqRawTransaction,
} from './nimiq'

const TREASURY = 'NQ94 FAH0 YLHQ S40D 5B2U XUDR L6XG 3GYU 2JEX'

/**
 * A transaction shaped like a real mainnet payment, trimmed to the fields the
 * verifier reads. The hash is synthetic — the test cares about the shape, and a
 * real 64-hex value would trip the secret scanner's private-key heuristic.
 */
const REAL_TX = {
  hash: 'b7'.repeat(32),
  blockNumber: 61788193,
  timestamp: 1789593466471,
  confirmations: 18,
  from: 'NQ16 2SSN 82TL SMQS KXT3 Q01V CMAL NU6F 1LJG',
  to: 'NQ22 JV9P 548B JL00 TRKS GT1P X3QJ 52BV ENK3',
  value: 33629,
  fee: 0,
  validityStartHeight: 61788185,
  networkId: NIMIQ_MAINNET_ID,
  executionResult: true,
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/** Wrap a payload the way a Nimiq node does. */
function envelope(data: unknown, metadata: unknown = null) {
  return jsonResponse({ jsonrpc: '2.0', result: { data, metadata }, id: 1 })
}

function notFound(hash = 'ab'.repeat(32)) {
  return jsonResponse({
    jsonrpc: '2.0',
    error: {
      code: -32603,
      message: 'Internal error',
      data: `Transaction not found: ${hash}`,
    },
    id: 1,
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('address helpers', () => {
  it('normalizes to a single canonical form', () => {
    expect(normalizeNimiqAddress(TREASURY)).toBe('NQ94FAH0YLHQS40D5B2UXUDRL6XG3GYU2JEX')
    expect(normalizeNimiqAddress(' nq94fah0ylhqs40d5b2uxudrl6xg3gyu2jex ')).toBe(
      'NQ94FAH0YLHQS40D5B2UXUDRL6XG3GYU2JEX',
    )
  })

  it('validates and compares addresses', () => {
    expect(isValidNimiqAddress(TREASURY)).toBe(true)
    expect(isValidNimiqAddress('NQ00FAH0YLHQS40D5B2UXUDRL6XG3GYU2JEX')).toBe(false)
    expect(nimiqAddressesEqual(TREASURY, TREASURY.toLowerCase())).toBe(true)
    expect(nimiqAddressesEqual(TREASURY, 'NQ22 JV9P 548B JL00 TRKS GT1P X3QJ 52BV ENK3')).toBe(
      false,
    )
  })
})

describe('resolveNimiqEndpoints', () => {
  it('falls back to the public default', () => {
    expect(resolveNimiqEndpoints()).toEqual(DEFAULT_NIMIQ_RPC_ENDPOINTS)
  })

  it('reads a comma-separated override', () => {
    vi.stubGlobal('Deno', {
      env: { get: () => 'https://a.example, https://b.example' },
    })
    expect(resolveNimiqEndpoints()).toEqual([
      'https://a.example',
      'https://b.example',
    ])
  })

  it('ignores an empty override', () => {
    vi.stubGlobal('Deno', { env: { get: () => '   ' } })
    expect(resolveNimiqEndpoints()).toEqual(DEFAULT_NIMIQ_RPC_ENDPOINTS)
  })
})

describe('getNimiqTransaction', () => {
  it('unwraps the { data } envelope', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => envelope(REAL_TX)))

    const tx = await getNimiqTransaction(REAL_TX.hash)
    expect(tx?.value).toBe(33629)
    expect(tx?.fee).toBe(0)
    expect(tx?.confirmations).toBe(18)
    expect(tx?.executionResult).toBe(true)
  })

  it('returns null when the node has not seen the transaction', async () => {
    // A pending payment is not an error — the verifier must keep polling.
    vi.stubGlobal('fetch', vi.fn(async () => notFound()))
    await expect(getNimiqTransaction('ab'.repeat(32))).resolves.toBeNull()
  })

  it('throws on errors that are not a missing transaction', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          jsonrpc: '2.0',
          error: { code: -32600, message: 'Invalid request' },
          id: 1,
        }),
      ),
    )
    await expect(getNimiqTransaction(REAL_TX.hash)).rejects.toThrow(/Invalid request/)
  })

  it('rejects a malformed hash before making a request', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(getNimiqTransaction('0x1234')).rejects.toThrow(/32 bytes of hex/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('accepts a 0x-prefixed hash', async () => {
    const fetchMock = vi.fn(async () => envelope(REAL_TX))
    vi.stubGlobal('fetch', fetchMock)

    await expect(getNimiqTransaction(`0x${REAL_TX.hash}`)).resolves.toBeTruthy()

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const body = JSON.parse(String(init.body))
    expect(body.params).toEqual([REAL_TX.hash])
  })
})

describe('endpoint failover', () => {
  it('uses the next endpoint when one fails', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('connection refused'))
      .mockResolvedValueOnce(envelope(REAL_TX))
    vi.stubGlobal('fetch', fetchMock)

    const tx = await getNimiqTransaction(REAL_TX.hash, [
      'https://down.example',
      'https://up.example',
    ])

    expect(tx?.hash).toBe(REAL_TX.hash)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('moves on after a non-2xx status', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('nope', { status: 502 }))
      .mockResolvedValueOnce(envelope(REAL_TX))
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      getNimiqTransaction(REAL_TX.hash, ['https://a.example', 'https://b.example']),
    ).resolves.toBeTruthy()
  })

  it('throws when every endpoint fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('down', { status: 503 })))

    await expect(
      getNimiqTransaction(REAL_TX.hash, ['https://a.example', 'https://b.example']),
    ).rejects.toThrow(NimiqRpcError)
  })

  it('reports a missing transaction only after all endpoints agree', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => notFound()))

    await expect(
      getNimiqTransaction('ab'.repeat(32), ['https://a.example', 'https://b.example']),
    ).resolves.toBeNull()
  })
})

describe('getNimiqAccount', () => {
  it('returns the balance in Luna', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        envelope({ address: TREASURY, balance: 0, type: 'basic' }, {
          blockNumber: 61788797,
        }),
      ),
    )

    const account = await getNimiqAccount(TREASURY)
    expect(account?.balance).toBe(0)
    expect(account?.type).toBe('basic')
  })

  it('sends the normalized address', async () => {
    const fetchMock = vi.fn(async () =>
      envelope({ address: TREASURY, balance: 1, type: 'basic' }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await getNimiqAccount(TREASURY)

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(String(init.body)).params).toEqual([
      'NQ94FAH0YLHQS40D5B2UXUDRL6XG3GYU2JEX',
    ])
  })

  it('rejects an invalid address before making a request', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(getNimiqAccount('0xabc')).rejects.toThrow(/Invalid Nimiq address/)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('sendNimiqRawTransaction', () => {
  it('broadcasts and returns the hash', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => envelope(REAL_TX.hash)))

    await expect(sendNimiqRawTransaction('0000aabb')).resolves.toBe(REAL_TX.hash)
  })

  it('rejects non-hex payloads', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(sendNimiqRawTransaction('zzzz')).rejects.toThrow(/must be hex/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('throws when no hash comes back', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => envelope(null)))
    await expect(sendNimiqRawTransaction('0000aabb')).rejects.toThrow(/no transaction hash/)
  })
})

describe('network queries', () => {
  it('reads consensus and block height', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        const { method } = JSON.parse(String(init.body))
        if (method === 'isConsensusEstablished') return envelope(true)
        if (method === 'getBlockNumber') return envelope(61788583)
        throw new Error(`unexpected method ${method}`)
      }),
    )

    await expect(isNimiqConsensusEstablished()).resolves.toBe(true)
    await expect(getNimiqBlockNumber()).resolves.toBe(61788583)
  })

  it('exposes the Albatross network ids', () => {
    expect(NIMIQ_MAINNET_ID).toBe(24)
    expect(NIMIQ_TESTNET_ID).toBe(5)
  })
})
