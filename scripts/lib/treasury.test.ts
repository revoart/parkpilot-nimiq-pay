import { describe, expect, it } from 'vitest'

import {
  assertNotSelfSend,
  assertTreasuryMatch,
  decimalToRaw,
  deriveTreasuryAccount,
  encodeTransfer,
  explorerTxUrl,
  normalizeMnemonic,
} from './treasury'

/** A well-known BIP-39 test vector — unfunded, published in the spec. */
const TEST_MNEMONIC = // check-secrets:allow — fixture for the derivation tests
  'abandon ability able about above absent absorb abstract absurd abuse access accident'

describe('normalizeMnemonic', () => {
  it('collapses newlines and stray spacing', () => {
    expect(normalizeMnemonic('  abandon\n ability\table  ')).toBe(
      'abandon ability able',
    )
  })

  it('leaves an already-normal phrase alone', () => {
    expect(normalizeMnemonic(TEST_MNEMONIC)).toBe(TEST_MNEMONIC)
  })
})

describe('deriveTreasuryAccount', () => {
  it('derives a stable address from a phrase', () => {
    const account = deriveTreasuryAccount(TEST_MNEMONIC)
    expect(account.address).toMatch(/^0x[0-9a-fA-F]{40}$/)
  })

  it('derives the same address from a messy paste', () => {
    // The realistic case: a phrase pasted with line breaks.
    const messy = TEST_MNEMONIC.split(' ').join('\n')
    expect(deriveTreasuryAccount(messy).address).toBe(
      deriveTreasuryAccount(TEST_MNEMONIC).address,
    )
  })

  it('derives a different address on a different path', () => {
    const first = deriveTreasuryAccount(TEST_MNEMONIC).address
    const second = deriveTreasuryAccount(TEST_MNEMONIC, "m/44'/60'/0'/0/1").address
    expect(second).not.toBe(first)
  })
})

describe('assertTreasuryMatch', () => {
  const address = '0xE4C5d04f359316f6AEa754F7ed7Edc0b38d0083F'

  it('passes when the addresses match', () => {
    expect(() => assertTreasuryMatch(address, address)).not.toThrow()
  })

  it('is case-insensitive', () => {
    expect(() =>
      assertTreasuryMatch(address.toLowerCase(), address.toUpperCase()),
    ).not.toThrow()
  })

  it('throws when they differ', () => {
    expect(() =>
      assertTreasuryMatch(
        '0x1111111111111111111111111111111111111111',
        address,
      ),
    ).toThrow(/Refusing to send/)
  })
})

describe('decimalToRaw', () => {
  it('converts whole and fractional USDT', () => {
    expect(decimalToRaw('1', 6)).toBe(1_000_000n)
    expect(decimalToRaw('1.5', 6)).toBe(1_500_000n)
    expect(decimalToRaw('0.000001', 6)).toBe(1n)
  })

  it('avoids floating point drift', () => {
    // 0.1 + 0.2 style errors would show up as 100000 vs 99999.
    expect(decimalToRaw('0.1', 6)).toBe(100_000n)
    expect(decimalToRaw('0.3', 6)).toBe(300_000n)
    expect(decimalToRaw(1.1, 6)).toBe(1_100_000n)
  })

  it('truncates beyond the token decimals rather than rounding up', () => {
    // Never send more than asked for.
    expect(decimalToRaw('1.1234567', 6)).toBe(1_123_456n)
  })

  it('rejects nonsense', () => {
    expect(() => decimalToRaw('abc', 6)).toThrow()
    expect(() => decimalToRaw('-1', 6)).toThrow()
    expect(() => decimalToRaw('', 6)).toThrow()
  })
})

describe('encodeTransfer', () => {
  it('encodes a standard ERC-20 transfer', () => {
    const data = encodeTransfer(
      '0x1111111111111111111111111111111111111111',
      1_000_000n,
    )
    // 0xa9059cbb is keccak256("transfer(address,uint256)")[:4]
    expect(data.startsWith('0xa9059cbb')).toBe(true)
    expect(data).toHaveLength(2 + 8 + 64 + 64)
  })

  it('pads the amount to a full word', () => {
    const data = encodeTransfer(
      '0x1111111111111111111111111111111111111111',
      1n,
    )
    expect(data.endsWith('1'.padStart(64, '0'))).toBe(true)
  })
})

describe('assertNotSelfSend', () => {
  const treasury = '0xE4C5d04f359316f6AEa754F7ed7Edc0b38d0083F'

  it('passes for a different address', () => {
    expect(() =>
      assertNotSelfSend('0x1111111111111111111111111111111111111111', treasury),
    ).not.toThrow()
  })

  it('throws when the payout address is the treasury', () => {
    expect(() => assertNotSelfSend(treasury, treasury)).toThrow(/treasury itself/)
  })
})

describe('explorerTxUrl', () => {
  it('builds a link and tolerates a trailing slash', () => {
    expect(explorerTxUrl('https://polygonscan.com', '0xabc')).toBe(
      'https://polygonscan.com/tx/0xabc',
    )
    expect(explorerTxUrl('https://polygonscan.com/', '0xabc')).toBe(
      'https://polygonscan.com/tx/0xabc',
    )
  })
})
