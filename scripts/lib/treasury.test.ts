import { describe, expect, it } from 'vitest'

import {
  NIMIQ_MAINNET_NETWORK_ID,
  NIMIQ_TESTNET_NETWORK_ID,
  addressFromMnemonic,
  addressesMatch,
  assertNotSelfSend,
  assertTreasuryKeyPair,
  buildSignedPayout,
  deriveKeyPair,
} from './treasury'

/**
 * The canonical 24-word BIP-39 test vector. Publicly known and used here only
 * to pin the derivation — the address below was produced by Nimiq's own client
 * and is asserted so a change in derivation path would be caught.
 */
// check-secrets:allow — the published BIP-39 test vector, not a real key.
const TEST_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art'
const TEST_ADDRESS = 'NQ09 UGD0 4DR3 E3UM H0TK TEPP DK7H QSQ9 2U6T'
const OTHER_ADDRESS = 'NQ94 FAH0 YLHQ S40D 5B2U XUDR L6XG 3GYU 2JEX'

describe('deriveKeyPair', () => {
  it('derives the expected account from the canonical mnemonic', () => {
    const keyPair = deriveKeyPair(TEST_MNEMONIC)
    expect(keyPair.toAddress().toUserFriendlyAddress()).toBe(TEST_ADDRESS)
  })

  it('tolerates extra whitespace and newlines', () => {
    const messy = `  ${TEST_MNEMONIC.replace(/ /g, '\n  ')}  `
    expect(addressFromMnemonic(messy)).toBe(TEST_ADDRESS)
  })

  it('rejects a 12-word phrase, which cannot produce a Nimiq account', () => {
    // Nimiq's entropy is 256 bits; a 128-bit phrase has no valid encoding.
    const twelve = TEST_MNEMONIC.split(' ').slice(0, 12).join(' ')
    expect(() => deriveKeyPair(twelve)).toThrow(/must be 24 words/)
  })

  it('rejects other lengths', () => {
    expect(() => deriveKeyPair('')).toThrow(/must be 24 words/)
    expect(() => deriveKeyPair('one two three')).toThrow(/must be 24 words/)
  })

  it('is deterministic', () => {
    expect(addressFromMnemonic(TEST_MNEMONIC)).toBe(addressFromMnemonic(TEST_MNEMONIC))
  })
})

describe('addressesMatch', () => {
  it('ignores case and spacing, which Nimiq addresses allow', () => {
    expect(addressesMatch(TEST_ADDRESS, 'nq09ugd04dr3e3umh0tkteppdk7hqsq92u6t')).toBe(true)
    expect(addressesMatch('NQ09 UGD0 4DR3 E3UM H0TK TEPP DK7H QSQ9 2U6T', 'NQ09UGD04DR3E3UMH0TKTEPPDK7HQSQ92U6T')).toBe(true)
  })

  it('is false for different accounts', () => {
    expect(addressesMatch(TEST_ADDRESS, OTHER_ADDRESS)).toBe(false)
  })
})

describe('assertTreasuryKeyPair', () => {
  it('accepts the key that matches the configured treasury', () => {
    expect(() =>
      assertTreasuryKeyPair(deriveKeyPair(TEST_MNEMONIC), TEST_ADDRESS),
    ).not.toThrow()
  })

  it('accepts a differently formatted spelling of the same address', () => {
    expect(() =>
      assertTreasuryKeyPair(
        deriveKeyPair(TEST_MNEMONIC),
        'NQ09UGD04DR3E3UMH0TKTEPPDK7HQSQ92U6T',
      ),
    ).not.toThrow()
  })

  it('refuses when the mnemonic belongs to a different account', () => {
    // The guard that stops a misconfigured signer sending from the wrong key.
    expect(() =>
      assertTreasuryKeyPair(deriveKeyPair(TEST_MNEMONIC), OTHER_ADDRESS),
    ).toThrow(/Treasury key mismatch/)
  })

  it('refuses when the configured address is not a Nimiq address', () => {
    expect(() =>
      assertTreasuryKeyPair(
        deriveKeyPair(TEST_MNEMONIC),
        '0x66c7d833a73e74efbb460a3170e1993eca4a79ad',
      ),
    ).toThrow(/not a valid Nimiq address/)
  })
})

describe('assertNotSelfSend', () => {
  it('refuses to pay the treasury out of the treasury', () => {
    expect(() => assertNotSelfSend(TEST_ADDRESS, TEST_ADDRESS)).toThrow(/itself/)
    expect(() =>
      assertNotSelfSend(TEST_ADDRESS, 'nq09ugd04dr3e3umh0tkteppdk7hqsq92u6t'),
    ).toThrow(/itself/)
  })

  it('allows a genuine payout', () => {
    expect(() => assertNotSelfSend(TEST_ADDRESS, OTHER_ADDRESS)).not.toThrow()
  })
})

describe('buildSignedPayout', () => {
  const keyPair = deriveKeyPair(TEST_MNEMONIC)

  it('signs and serializes a transaction without broadcasting it', () => {
    const { serialized, hash } = buildSignedPayout(keyPair, {
      sender: TEST_ADDRESS,
      recipient: OTHER_ADDRESS,
      amountNim: '5000',
      validityStartHeight: 100_000,
    })

    // 139 bytes is the reference length for a basic Albatross transaction.
    expect(serialized.length / 2).toBe(139)
    expect(serialized).toMatch(/^[0-9a-f]+$/)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is deterministic for identical inputs, which is what makes a retry safe', () => {
    const input = {
      sender: TEST_ADDRESS,
      recipient: OTHER_ADDRESS,
      amountNim: '5000',
      validityStartHeight: 100_000,
    }
    const first = buildSignedPayout(keyPair, input)
    const second = buildSignedPayout(keyPair, input)

    // Same bytes, same hash — re-broadcasting cannot double-pay.
    expect(second.serialized).toBe(first.serialized)
    expect(second.hash).toBe(first.hash)
  })

  it('produces a different transaction for a different amount', () => {
    const base = {
      sender: TEST_ADDRESS,
      recipient: OTHER_ADDRESS,
      validityStartHeight: 100_000,
    }
    const small = buildSignedPayout(keyPair, { ...base, amountNim: '5000' })
    const large = buildSignedPayout(keyPair, { ...base, amountNim: '6000' })

    expect(large.serialized).not.toBe(small.serialized)
    expect(large.hash).not.toBe(small.hash)
  })

  it('rejects a zero or negative amount', () => {
    const base = {
      sender: TEST_ADDRESS,
      recipient: OTHER_ADDRESS,
      validityStartHeight: 100_000,
    }
    expect(() => buildSignedPayout(keyPair, { ...base, amountNim: '0' })).toThrow(
      /greater than zero/,
    )
  })

  it('rejects sub-Luna precision rather than silently truncating', () => {
    expect(() =>
      buildSignedPayout(keyPair, {
        sender: TEST_ADDRESS,
        recipient: OTHER_ADDRESS,
        amountNim: '0.000001',
        validityStartHeight: 100_000,
      }),
    ).toThrow(/smaller than one Luna/)
  })

  it('refuses to send to the treasury itself', () => {
    expect(() =>
      buildSignedPayout(keyPair, {
        sender: TEST_ADDRESS,
        recipient: TEST_ADDRESS,
        amountNim: '5000',
        validityStartHeight: 100_000,
      }),
    ).toThrow(/itself/)
  })

  it('uses the mainnet network id by default and accepts a testnet one', () => {
    const mainnet = buildSignedPayout(keyPair, {
      sender: TEST_ADDRESS,
      recipient: OTHER_ADDRESS,
      amountNim: '5000',
      validityStartHeight: 100_000,
    })
    const testnet = buildSignedPayout(keyPair, {
      sender: TEST_ADDRESS,
      recipient: OTHER_ADDRESS,
      amountNim: '5000',
      validityStartHeight: 100_000,
      networkId: NIMIQ_TESTNET_NETWORK_ID,
    })

    // The network id is part of the signed content, so the bytes differ.
    expect(testnet.serialized).not.toBe(mainnet.serialized)
    expect(NIMIQ_MAINNET_NETWORK_ID).toBe(24)
    expect(NIMIQ_TESTNET_NETWORK_ID).toBe(5)
  })
})
