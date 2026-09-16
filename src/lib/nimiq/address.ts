/**
 * Nimiq address handling.
 *
 * Nimiq addresses are IBAN-shaped: "NQ" + a two-digit mod-97 checksum + 32
 * base32 characters encoding 20 raw bytes. The canonical display form groups
 * those characters in fours, e.g. "NQ94 FAH0 YLHQ S40D 5B2U XUDR L6XG 3GYU 2JEX".
 *
 * Storage form is the stripped, uppercase string (no spaces) so that one
 * address has exactly one representation in the database. Use
 * `formatNimiqAddress` when rendering.
 */

/** Nimiq's base32 alphabet. Note the gaps: I, O, W and Z are not used. */
export const NIMIQ_ALPHABET = '0123456789ABCDEFGHJKLMNPQRSTUVXY'

const COUNTRY_CODE = 'NQ'
const ENCODED_LENGTH = 32
const ADDRESS_LENGTH = COUNTRY_CODE.length + 2 + ENCODED_LENGTH
export const ADDRESS_BYTES = 20

/** Remove formatting so two spellings of the same address compare equal. */
export function stripNimiqAddress(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase()
}

/**
 * IBAN mod-97 over the rearranged address. Returns 1 for a well-formed
 * checksum. Letters expand to two digits (A=10 ... Z=35), so the running
 * remainder is advanced by two digits for those to avoid precision loss.
 */
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

export function isValidNimiqAddress(value: unknown): value is string {
  if (typeof value !== 'string') return false

  const stripped = stripNimiqAddress(value)
  if (stripped.length !== ADDRESS_LENGTH) return false
  if (!stripped.startsWith(COUNTRY_CODE)) return false

  const encoded = stripped.slice(COUNTRY_CODE.length)

  // The mod-97 checksum alone does not reject characters outside the alphabet,
  // so a shape-only check would accept addresses the checksum happens to pass.
  for (const char of encoded) {
    if (!NIMIQ_ALPHABET.includes(char)) return false
  }

  return ibanChecksum(stripped) === 1
}

/** Canonical storage form: stripped and uppercase. */
export function normalizeNimiqAddress(value: string): string {
  return stripNimiqAddress(value)
}

/** Canonical display form: uppercase, grouped in fours. */
export function formatNimiqAddress(value: string): string {
  const stripped = stripNimiqAddress(value)
  const groups: string[] = []
  for (let i = 0; i < stripped.length; i += 4) {
    groups.push(stripped.slice(i, i + 4))
  }
  return groups.join(' ')
}

export function assertValidNimiqAddress(value: unknown, label: string): string {
  if (!isValidNimiqAddress(value)) {
    throw new Error(`Invalid ${label}: not a valid Nimiq address.`)
  }
  return normalizeNimiqAddress(value)
}

export function nimiqAddressesEqual(a: string, b: string): boolean {
  if (!isValidNimiqAddress(a) || !isValidNimiqAddress(b)) return false
  return stripNimiqAddress(a) === stripNimiqAddress(b)
}

/** Decode the 32 base32 characters of a user-friendly address to 20 bytes. */
export function decodeNimiqAddress(value: string): Uint8Array {
  if (!isValidNimiqAddress(value)) {
    throw new Error('Invalid Nimiq address: cannot decode.')
  }

  const encoded = stripNimiqAddress(value).slice(COUNTRY_CODE.length)
  let bits = 0n
  for (const char of encoded) {
    bits = (bits << 5n) | BigInt(NIMIQ_ALPHABET.indexOf(char))
  }

  const bytes = new Uint8Array(ADDRESS_BYTES)
  for (let i = ADDRESS_BYTES - 1; i >= 0; i--) {
    bytes[i] = Number((bits >> BigInt((ADDRESS_BYTES - 1 - i) * 8)) & 255n)
  }
  return bytes
}

/** Encode 20 raw address bytes as a user-friendly NQ address. */
export function encodeNimiqAddress(bytes: Uint8Array): string {
  if (bytes.length !== ADDRESS_BYTES) {
    throw new Error(`Nimiq addresses are ${ADDRESS_BYTES} bytes.`)
  }

  let bits = 0n
  for (const byte of bytes) {
    bits = (bits << 8n) | BigInt(byte)
  }

  let encoded = ''
  for (let i = ENCODED_LENGTH - 1; i >= 0; i--) {
    encoded += NIMIQ_ALPHABET[Number((bits >> BigInt(i * 5)) & 31n)]
  }

  const checksum = 98 - ibanChecksum(`${COUNTRY_CODE}00${encoded}`)
  const padded = String(checksum).padStart(2, '0')
  return `${COUNTRY_CODE}${padded}${encoded}`
}

export function nimiqAddressToHex(value: string): string {
  return Array.from(decodeNimiqAddress(value))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export function hexToNimiqAddress(hex: string): string {
  const cleaned = hex.replace(/^0x/i, '')
  if (!/^[0-9a-fA-F]{40}$/.test(cleaned)) {
    throw new Error('Nimiq addresses are 20 bytes of hex.')
  }
  const bytes = new Uint8Array(ADDRESS_BYTES)
  for (let i = 0; i < ADDRESS_BYTES; i++) {
    bytes[i] = parseInt(cleaned.slice(i * 2, i * 2 + 2), 16)
  }
  return encodeNimiqAddress(bytes)
}
