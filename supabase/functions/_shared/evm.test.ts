import { describe, expect, it } from 'vitest'

import {
  TRANSFER_TOPIC,
  decimalToRaw,
  findTransfer,
  isValidEvmAddress,
  normalizeAddress,
  rawToDecimal,
  topicToAddress,
  type RpcReceipt,
} from './evm'

const USDT = '0xc2132D05D31c914a87C6611C10748AEb04B58e8F'
const TREASURY = '0xE4C5d04f359316f6AEa754F7ed7Edc0b38d0083F'
const HOST = '0x1111111111111111111111111111111111111111'

function topic(address: string): string {
  return `0x${'0'.repeat(24)}${address.slice(2).toLowerCase()}`
}

function receiptWith(logs: RpcReceipt['logs']): RpcReceipt {
  return {
    status: '0x1',
    blockNumber: '0x1',
    from: TREASURY,
    to: USDT,
    logs,
  }
}

function transferLog(overrides: Partial<RpcReceipt['logs'][number]> = {}) {
  return {
    address: USDT,
    topics: [TRANSFER_TOPIC, topic(TREASURY), topic(HOST)],
    data: '0x5f5e100',
    ...overrides,
  }
}

describe('decimalToRaw / rawToDecimal', () => {
  it('converts 6-decimal USDT without floating point error', () => {
    expect(decimalToRaw('99.9904', 6)).toBe(99_990_400n)
    expect(decimalToRaw('1', 6)).toBe(1_000_000n)
    expect(decimalToRaw('0.000001', 6)).toBe(1n)
  })

  it('truncates rather than rounds extra precision', () => {
    expect(decimalToRaw('1.9999999', 6)).toBe(1_999_999n)
  })

  it('pads short fractions', () => {
    expect(decimalToRaw('1.5', 6)).toBe(1_500_000n)
  })

  it('rejects malformed amounts', () => {
    expect(() => decimalToRaw('abc', 6)).toThrow()
    expect(() => decimalToRaw('1e18', 6)).toThrow()
    expect(() => decimalToRaw('-1', 6)).toThrow()
    expect(() => decimalToRaw('', 6)).toThrow()
  })

  it('round-trips through raw units', () => {
    for (const value of ['0', '1', '99.9904', '1234.5', '0.000001']) {
      expect(rawToDecimal(decimalToRaw(value, 6), 6)).toBe(
        value === '0' ? '0' : value,
      )
    }
  })

  it('trims trailing zeros when converting back', () => {
    expect(rawToDecimal(1_500_000n, 6)).toBe('1.5')
    expect(rawToDecimal(1_000_000n, 6)).toBe('1')
    expect(rawToDecimal(0n, 6)).toBe('0')
  })

  it('handles negatives', () => {
    expect(rawToDecimal(-1_500_000n, 6)).toBe('-1.5')
  })
})

describe('address helpers', () => {
  it('validates 20-byte hex addresses only', () => {
    expect(isValidEvmAddress(USDT)).toBe(true)
    expect(isValidEvmAddress('0x123')).toBe(false)
    expect(isValidEvmAddress(USDT.slice(0, -1))).toBe(false)
    expect(isValidEvmAddress(null)).toBe(false)
    expect(isValidEvmAddress(42)).toBe(false)
  })

  it('lowercases for comparison', () => {
    expect(normalizeAddress(USDT)).toBe(USDT.toLowerCase())
  })

  it('decodes an address from a 32-byte topic', () => {
    expect(topicToAddress(topic(TREASURY))).toBe(TREASURY.toLowerCase())
  })

  it('rejects malformed topics', () => {
    expect(() => topicToAddress('0xdeadbeef')).toThrow()
    expect(() => topicToAddress(`0x${'0'.repeat(63)}`)).toThrow()
  })
})

describe('findTransfer', () => {
  it('matches a correct treasury -> host transfer', () => {
    const match = findTransfer(receiptWith([transferLog()]), USDT, TREASURY, HOST)
    expect(match).toEqual({
      from: TREASURY.toLowerCase(),
      to: HOST.toLowerCase(),
      value: 100_000_000n,
    })
  })

  it('matches regardless of address casing', () => {
    const match = findTransfer(
      receiptWith([transferLog()]),
      USDT.toLowerCase(),
      TREASURY.toUpperCase().replace('0X', '0x'),
      HOST,
    )
    expect(match).not.toBeNull()
  })

  it('rejects a transfer of a different token', () => {
    const other = '0x0000000000000000000000000000000000000001'
    const match = findTransfer(
      receiptWith([transferLog({ address: other })]),
      USDT,
      TREASURY,
      HOST,
    )
    expect(match).toBeNull()
  })

  it('rejects a transfer from the wrong sender', () => {
    const match = findTransfer(
      receiptWith([
        transferLog({
          topics: [
            TRANSFER_TOPIC,
            topic('0x2222222222222222222222222222222222222222'),
            topic(HOST),
          ],
        }),
      ]),
      USDT,
      TREASURY,
      HOST,
    )
    expect(match).toBeNull()
  })

  it('rejects a transfer to the wrong recipient', () => {
    const match = findTransfer(
      receiptWith([
        transferLog({
          topics: [
            TRANSFER_TOPIC,
            topic(TREASURY),
            topic('0x3333333333333333333333333333333333333333'),
          ],
        }),
      ]),
      USDT,
      TREASURY,
      HOST,
    )
    expect(match).toBeNull()
  })

  it('ignores logs with the wrong number of topics', () => {
    const match = findTransfer(
      receiptWith([
        transferLog({ topics: [TRANSFER_TOPIC, topic(TREASURY)] }),
      ]),
      USDT,
      TREASURY,
      HOST,
    )
    expect(match).toBeNull()
  })

  it('ignores logs whose first topic is not Transfer', () => {
    const match = findTransfer(
      receiptWith([
        transferLog({
          topics: [`0x${'a'.repeat(64)}`, topic(TREASURY), topic(HOST)],
        }),
      ]),
      USDT,
      TREASURY,
      HOST,
    )
    expect(match).toBeNull()
  })

  it('skips malformed address topics instead of throwing', () => {
    const match = findTransfer(
      receiptWith([
        transferLog({ topics: [TRANSFER_TOPIC, '0xdeadbeef', topic(HOST)] }),
        transferLog(),
      ]),
      USDT,
      TREASURY,
      HOST,
    )
    expect(match).not.toBeNull()
  })

  it('returns null for a receipt with no logs', () => {
    expect(findTransfer(receiptWith([]), USDT, TREASURY, HOST)).toBeNull()
  })

  it('finds the matching log among unrelated ones', () => {
    const match = findTransfer(
      receiptWith([
        transferLog({
          topics: [
            TRANSFER_TOPIC,
            topic('0x4444444444444444444444444444444444444444'),
            topic('0x5555555555555555555555555555555555555555'),
          ],
        }),
        transferLog({ data: '0x1' }),
      ]),
      USDT,
      TREASURY,
      HOST,
    )
    expect(match?.value).toBe(1n)
  })
})
