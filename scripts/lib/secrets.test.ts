import { describe, expect, it } from 'vitest'

import {
  PUBLIC_HEX_ALLOWLIST,
  findMnemonics,
  findPrivateKeys,
  findSecretAssignments,
  scanText,
} from './secrets'

/**
 * A real BIP-39 phrase, used only to prove the detector fires. It is a
 * well-known test vector from the BIP-39 spec, not a funded wallet.
 */
const TEST_MNEMONIC = // check-secrets:allow — this file exists to contain a phrase
  'abandon ability able about above absent absorb abstract absurd abuse access accident'

describe('findMnemonics', () => {
  it('detects a 12-word phrase', () => {
    const findings = findMnemonics(TEST_MNEMONIC)
    expect(findings).toHaveLength(1)
    expect(findings[0].kind).toBe('mnemonic')
    expect(findings[0].line).toBe(1)
  })

  it('detects a phrase split across lines', () => {
    // The realistic shape: pasted with line breaks, as a user would.
    const spread = TEST_MNEMONIC.split(' ')
      .map((word, index) => (index % 4 === 3 ? `${word}\n` : `${word} `))
      .join('')
    expect(findMnemonics(spread)).toHaveLength(1)
  })

  it('detects a 24-word phrase', () => {
    const words = TEST_MNEMONIC.split(' ')
    const twentyFour = [...words, ...words].join(' ')
    const findings = findMnemonics(twentyFour)
    expect(findings.length).toBeGreaterThanOrEqual(1)
  })

  it('reports which line the phrase starts on', () => {
    // Uppercase filler on purpose: the tokenizer only reads lowercase runs, so
    // the heading cannot contribute a stray word to the phrase.
    const findings = findMnemonics(`FIRST\nSECOND\n${TEST_MNEMONIC}`)
    expect(findings[0].line).toBe(3)
  })

  it('does not fire on ordinary prose', () => {
    expect(
      findMnemonics(
        'The driver parked the car near the station and walked to the office.',
      ),
    ).toHaveLength(0)
  })

  it('does not fire on a few dictionary words in a row', () => {
    // "black", "main" and "pilot" are all BIP-39 words, but three is not a phrase.
    expect(findMnemonics('black main pilot')).toHaveLength(0)
  })

  it('never includes the phrase itself in the finding', () => {
    const findings = findMnemonics(TEST_MNEMONIC)
    expect(JSON.stringify(findings)).not.toContain('abandon')
  })
})

describe('findPrivateKeys', () => {
  it('detects a bare 64-hex value', () => {
    const key = 'a'.repeat(64)
    const findings = findPrivateKeys(`PRIVATE = ${key}`)
    expect(findings).toHaveLength(1)
    expect(findings[0].kind).toBe('private-key')
  })

  it('detects a 0x-prefixed 64-hex value', () => {
    expect(findPrivateKeys(`0x${'b'.repeat(64)}`)).toHaveLength(1)
  })

  it('allows a value on the public allow-list', () => {
    // The mechanism matters even though the list is currently empty: the ERC-20
    // transfer topic it used to hold went with the EVM rail, and the next
    // public constant will need somewhere to live.
    const value = 'a'.repeat(64)
    expect(findPrivateKeys(value)).toHaveLength(1)

    PUBLIC_HEX_ALLOWLIST.add(value)
    try {
      expect(findPrivateKeys(value)).toHaveLength(0)
    } finally {
      PUBLIC_HEX_ALLOWLIST.delete(value)
    }
  })

  it('still reports a 64-hex value that is not on the list', () => {
    expect(findPrivateKeys(`0x${'e'.repeat(64)}`)).toHaveLength(1)
  })

  it('ignores hex that is shorter or longer than a key', () => {
    expect(findPrivateKeys('0x'.concat('c'.repeat(40)))).toHaveLength(0)
    expect(findPrivateKeys('0x'.concat('c'.repeat(80)))).toHaveLength(0)
  })

  it('ignores a 64-hex value embedded in a longer hex string', () => {
    expect(findPrivateKeys(`0x${'d'.repeat(80)}`)).toHaveLength(0)
  })

  it('never echoes the whole key', () => {
    const key = 'e'.repeat(64)
    const findings = findPrivateKeys(key)
    expect(JSON.stringify(findings)).not.toContain(key)
  })
})

describe('findSecretAssignments', () => {
  it('detects a mnemonic assignment', () => {
    // check-secrets:allow
    const findings = findSecretAssignments('TREASURY_MNEMONIC=evolve uphold choice')
    expect(findings).toHaveLength(1)
    expect(findings[0].kind).toBe('secret-assignment')
  })

  it('detects a private key assignment', () => {
    expect( // check-secrets:allow
      findSecretAssignments('private_key: 0xabc123def456'),
    ).toHaveLength(1)
  })

  it('ignores placeholders and empty values', () => {
    // check-secrets:allow
    expect(findSecretAssignments('MNEMONIC=')).toHaveLength(0)
    expect(findSecretAssignments('MNEMONIC=your mnemonic here')).toHaveLength(0)
    expect(findSecretAssignments('PRIVATE_KEY=changeme')).toHaveLength(0)
    expect(findSecretAssignments('SEED_PHRASE=<your phrase>')).toHaveLength(0)
  })

  it('ignores references to other variables', () => {
    expect(findSecretAssignments('mnemonic: process.env.TREASURY_MNEMONIC')).toHaveLength(0)
    expect(findSecretAssignments('mnemonic = Deno.env.get("X")')).toHaveLength(0)
    expect(findSecretAssignments('privateKey: import.meta.env.KEY')).toHaveLength(0)
  })
})

describe('scanText', () => {
  it('reports findings in line order', () => {
    const key = 'f'.repeat(64)
    const text = [`PRIVATE_KEY=${key}`, '', TEST_MNEMONIC].join('\n')
    const findings = scanText(text)
    expect(findings.length).toBeGreaterThanOrEqual(2)
    const lines = findings.map((finding) => finding.line)
    expect([...lines].sort((a, b) => a - b)).toEqual(lines)
  })

  it('is clean on ordinary source code', () => {
    const source = `
      export function add(a: number, b: number) {
        return a + b
      }
    `
    expect(scanText(source)).toHaveLength(0)
  })
})

describe('false positives that made the check unusable', () => {
  it('ignores type annotations', () => {
    // A declaration is not a value. Flagging these would fire on any typed code.
    expect(findSecretAssignments('function f(mnemonic: string) {}')).toHaveLength(0)
    expect(findSecretAssignments('const opts: { mnemonic: string } = x')).toHaveLength(0)
    expect(findSecretAssignments('private_key: string | null')).toHaveLength(0)
    // check-secrets:allow — the detector's own test data, not a secret.
    expect(findSecretAssignments('secret_key: number')).toHaveLength(0)
  })

  it('ignores reads from elsewhere', () => {
    expect(findSecretAssignments('const mnemonic = readMnemonic()')).toHaveLength(0)
    expect(findSecretAssignments('mnemonic = process.env.MNEMONIC')).toHaveLength(0)
    expect(findSecretAssignments('privateKey = Deno.env.get("KEY")')).toHaveLength(0)
  })

  it('ignores prose in comments', () => {
    // Documentation says "the mnemonic: string" and means nothing by it.
    const doc = [
      '/**',
      ' * Derive the key pair from a mnemonic.',
      // check-secrets:allow — the detector's own test data, not a secret.
      ' * @param mnemonic: string the phrase',
      ' */',
      'function f() {}',
    ].join('\n')
    expect(findSecretAssignments(doc)).toHaveLength(0)
  })

  it('still reports a real assignment, even one that starts with a type word', () => {
    // "string" is in the BIP-39 wordlist, so this must not be mistaken for a
    // type annotation just because it begins with one.
    // check-secrets:allow — the detector's own test data, not a secret.
    const real = `const mnemonic = 'string abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'`
    expect(findSecretAssignments(real)).toHaveLength(1)
  })

  it('still reports a plain mnemonic assignment', () => {
    expect(findSecretAssignments(`const mnemonic = '${'abandon '.repeat(23)}art'`)).toHaveLength(1)
  })
})
