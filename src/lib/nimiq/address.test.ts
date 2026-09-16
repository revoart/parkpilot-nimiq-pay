import { describe, expect, it } from 'vitest'

import {
  ADDRESS_BYTES,
  decodeNimiqAddress,
  encodeNimiqAddress,
  formatNimiqAddress,
  hexToNimiqAddress,
  isValidNimiqAddress,
  nimiqAddressesEqual,
  nimiqAddressToHex,
  normalizeNimiqAddress,
  stripNimiqAddress,
} from './address'

/**
 * Official vectors from the Nimiq Albatross serialization reference. The hex
 * address is the Blake2b digest of a known public key, so this pins the
 * encoding against the protocol rather than against our own output.
 */
const VECTOR_HEX = '689dae2f77b048dcc08e14d73104ea14222b5be1'
const VECTOR_NQ = 'NQ17D2ESUBTPN14DRG4E2KBK217A2GH2NNY1'

/** The zero address. Nimiq's burn address, per the reference implementation. */
const BURN_ADDRESS = 'NQ0700000000000000000000000000000000'

/** The all-0x11 address, picked in the reference for easy recognition. */
const ALL_ONES_HEX = '1111111111111111111111111111111111111111'
const ALL_ONES_ADDRESS = 'NQ34248H248H248H248H248H248H248H248H'

/** The ParkPilot treasury, supplied by the operator. */
const TREASURY = 'NQ94 FAH0 YLHQ S40D 5B2U XUDR L6XG 3GYU 2JEX'

describe('isValidNimiqAddress', () => {
  it('accepts addresses from the official reference', () => {
    expect(isValidNimiqAddress(VECTOR_NQ)).toBe(true)
    expect(isValidNimiqAddress(ALL_ONES_ADDRESS)).toBe(true)
    expect(isValidNimiqAddress(BURN_ADDRESS)).toBe(true)
  })

  it('accepts the treasury in both spaced and stripped form', () => {
    expect(isValidNimiqAddress(TREASURY)).toBe(true)
    expect(isValidNimiqAddress('NQ94FAH0YLHQS40D5B2UXUDRL6XG3GYU2JEX')).toBe(true)
  })

  it('accepts lowercase input, since addresses are case-insensitive', () => {
    expect(isValidNimiqAddress(VECTOR_NQ.toLowerCase())).toBe(true)
  })

  it('rejects a wrong check digit', () => {
    // Same body as the official vector, one digit off in the checksum.
    expect(isValidNimiqAddress('NQ16D2ESUBTPN14DRG4E2KBK217A2GH2NNY1')).toBe(false)
    expect(isValidNimiqAddress('NQ00FAH0YLHQS40D5B2UXUDRL6XG3GYU2JEX')).toBe(false)
    expect(isValidNimiqAddress('NQ94FAH0YLHQS40D5B2UXUDRL6XG3GYU2JE0')).toBe(false)
  })

  it('rejects wrong length and wrong country code', () => {
    expect(isValidNimiqAddress('NQ17D2ESUBTPN14DRG4E2KBK217A2GH2NNY')).toBe(false)
    expect(isValidNimiqAddress(`${VECTOR_NQ}A`)).toBe(false)
    expect(isValidNimiqAddress('XX17D2ESUBTPN14DRG4E2KBK217A2GH2NNY1')).toBe(false)
  })

  it('rejects characters outside the Nimiq alphabet', () => {
    // "I" is not in Nimiq's base32 alphabet. A shape-only check such as
    // /^NQ[0-9]{2}[0-9A-Z]{32}$/ accepts this string, so the alphabet must be
    // checked explicitly.
    const withI = 'NQ94IAH0YLHQS40D5B2UXUDRL6XG3GYU2JEX'
    expect(/^NQ[0-9]{2}[0-9A-Z]{32}$/.test(withI)).toBe(true)
    expect(isValidNimiqAddress(withI)).toBe(false)

    for (const char of ['O', 'W', 'Z']) {
      const candidate = `NQ94${char}AH0YLHQS40D5B2UXUDRL6XG3GYU2JE`
      expect(isValidNimiqAddress(candidate)).toBe(false)
    }
  })

  it('rejects non-strings and empty input', () => {
    expect(isValidNimiqAddress(undefined)).toBe(false)
    expect(isValidNimiqAddress(null)).toBe(false)
    expect(isValidNimiqAddress(12345)).toBe(false)
    expect(isValidNimiqAddress('')).toBe(false)
  })
})

describe('normalizeNimiqAddress', () => {
  it('produces one canonical form regardless of input formatting', () => {
    expect(normalizeNimiqAddress(TREASURY)).toBe('NQ94FAH0YLHQS40D5B2UXUDRL6XG3GYU2JEX')
    expect(normalizeNimiqAddress(TREASURY.toLowerCase())).toBe(
      normalizeNimiqAddress(TREASURY),
    )
    expect(normalizeNimiqAddress('NQ94  FAH0\nYLHQ S40D 5B2U XUDR L6XG 3GYU 2JEX')).toBe(
      normalizeNimiqAddress(TREASURY),
    )
  })
})

describe('formatNimiqAddress', () => {
  it('groups the canonical form in fours', () => {
    expect(formatNimiqAddress(VECTOR_NQ)).toBe(
      'NQ17 D2ES UBTP N14D RG4E 2KBK 217A 2GH2 NNY1',
    )
    expect(formatNimiqAddress(TREASURY)).toBe(TREASURY)
  })

  it('is idempotent', () => {
    const once = formatNimiqAddress(TREASURY)
    expect(formatNimiqAddress(once)).toBe(once)
  })
})

describe('stripNimiqAddress', () => {
  it('removes whitespace and uppercases', () => {
    expect(stripNimiqAddress(' nq94 fah0 ylhq s40d 5b2u xudr l6xg 3gyu 2jex ')).toBe(
      'NQ94FAH0YLHQS40D5B2UXUDRL6XG3GYU2JEX',
    )
  })
})

describe('nimiqAddressesEqual', () => {
  it('ignores formatting and case', () => {
    expect(nimiqAddressesEqual(TREASURY, TREASURY.toLowerCase())).toBe(true)
    expect(nimiqAddressesEqual(TREASURY, 'NQ94FAH0YLHQS40D5B2UXUDRL6XG3GYU2JEX')).toBe(true)
  })

  it('is false for different addresses', () => {
    expect(nimiqAddressesEqual(TREASURY, VECTOR_NQ)).toBe(false)
  })

  it('is false when either side is malformed', () => {
    expect(nimiqAddressesEqual(TREASURY, 'not-an-address')).toBe(false)
    expect(nimiqAddressesEqual('not-an-address', TREASURY)).toBe(false)
  })
})

describe('encode and decode', () => {
  it('encodes the official reference digest to its user-friendly address', () => {
    expect(hexToNimiqAddress(VECTOR_HEX)).toBe(VECTOR_NQ)
  })

  it('decodes a user-friendly address back to its digest', () => {
    expect(nimiqAddressToHex(VECTOR_NQ)).toBe(VECTOR_HEX)
    expect(nimiqAddressToHex(TREASURY)).toBe('7aa20fd238d100d2ac5cf71b9a1bd01c3fc149de')
  })

  it('round-trips every byte value', () => {
    const bytes = new Uint8Array(ADDRESS_BYTES)
    for (let i = 0; i < ADDRESS_BYTES; i++) bytes[i] = (i * 13) % 256

    const encoded = encodeNimiqAddress(bytes)
    expect(isValidNimiqAddress(encoded)).toBe(true)
    expect(Array.from(decodeNimiqAddress(encoded))).toEqual(Array.from(bytes))
  })

  it('round-trips the zero address to the burn address', () => {
    expect(encodeNimiqAddress(new Uint8Array(ADDRESS_BYTES))).toBe(BURN_ADDRESS)
  })

  it('encodes the all-0x11 address to the reference value', () => {
    const bytes = new Uint8Array(ADDRESS_BYTES).fill(0x11)
    expect(encodeNimiqAddress(bytes)).toBe(ALL_ONES_ADDRESS)
    expect(nimiqAddressToHex(ALL_ONES_ADDRESS)).toBe(ALL_ONES_HEX)
  })

  it('rejects wrong-length input', () => {
    expect(() => encodeNimiqAddress(new Uint8Array(19))).toThrow()
    expect(() => hexToNimiqAddress('689dae')).toThrow()
    expect(() => decodeNimiqAddress('nonsense')).toThrow()
  })
})
