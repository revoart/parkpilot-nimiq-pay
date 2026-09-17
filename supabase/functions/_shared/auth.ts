import { ed25519 } from 'npm:@noble/curves@1/ed25519'
import { blake2b } from 'npm:@noble/hashes@1/blake2b'

import {
  isValidNimiqAddress,
  nimiqAddressFromDigest,
} from './nimiq.ts'

/**
 * Wallet authentication.
 *
 * The wallet signs a one-time challenge; the backend verifies it and issues a
 * short-lived session token. Every write endpoint derives the acting wallet from
 * that token, so the app can only act as an account it controls.
 *
 * Nimiq Pay's `sign()` takes a plain string rather than EIP-712 structured data,
 * so the challenge is a short human-readable message. That is a feature: the
 * approval dialog shows the user exactly what they are signing, and the message
 * names ParkPilot so a signature harvested here is meaningless anywhere else.
 */

export interface AuthMessage {
  address: string
  nonce: string
  issuedAt: string
}

/**
 * The identity key for an account: stripped and lowercased.
 *
 * Nimiq's base32 alphabet is uppercase and addresses are case-insensitive, and
 * the SQL that keys ledger accounts compares with `lower(...)`, so one canonical
 * form avoids two spellings of one account.
 */
export function nimiqIdentity(value: string): string {
  return value.replace(/\s+/g, '').toLowerCase()
}

/**
 * The exact text the wallet signs.
 *
 * Kept deliberately **tiny** — just a domain tag and the server's one-time
 * nonce. Nimiq Pay wraps long messages to fit its approval dialog, splitting
 * them mid-word and even mid-address, and a wrapped message does not verify
 * against a single-line reconstruction. Keeping it to ~25 characters makes
 * wrapping impossible and removes that whole class of failure.
 *
 * Nothing security-relevant is lost by leaving the address and timestamp out:
 * `verifyAuthSignature` already derives the address from the public key and
 * requires it to equal the claimed one, so the address is bound
 * cryptographically rather than by appearing in the text. The nonce is stored
 * against the address and single-use, and the expiry is enforced from the
 * challenge row — so replay and expiry are unaffected.
 */
export function buildAuthMessage(message: AuthMessage): string {
  return `ParkPilot:${message.nonce}`
}

export function isValidAddress(value: unknown): value is string {
  return isValidNimiqAddress(value)
}

/**
 * The address a public key derives to, or null if the key is malformed.
 *
 * Exposed so a failed verification can record what it compared. Temporary
 * diagnostic support while the wallet's signing scheme is being pinned.
 */
export function deriveAddressFromPublicKey(
  publicKeyHex: string,
): string | null {
  try {
    if (!/^[0-9a-fA-F]{64}$/.test(publicKeyHex)) return null
    return nimiqAddressFromDigest(blake2b(hexToBytes(publicKeyHex), { dkLen: 32 }))
  } catch {
    return null
  }
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

/**
 * Verify a Nimiq sign-in.
 *
 * Two things must hold, and the first is the one that actually protects the
 * account: the supplied public key must derive to the address being claimed.
 * Without that check, anyone could sign with their own key and present someone
 * else's address, and the signature would verify perfectly.
 */
export async function verifyAuthSignature(
  message: AuthMessage,
  signatureHex: string,
  publicKeyHex: string,
): Promise<boolean> {
  try {
    if (!/^[0-9a-fA-F]{64}$/.test(publicKeyHex)) return false
    if (!/^[0-9a-fA-F]{128}$/.test(signatureHex)) return false
    if (!isValidNimiqAddress(message.address)) return false

    const publicKey = hexToBytes(publicKeyHex)
    const signature = hexToBytes(signatureHex)

    // Nimiq derives the address from the first 20 bytes of Blake2b-256(pubkey).
    const derived = nimiqAddressFromDigest(blake2b(publicKey, { dkLen: 32 }))
    if (nimiqIdentity(derived) !== nimiqIdentity(message.address)) return false

    const raw = new TextEncoder().encode(buildAuthMessage(message))

    // Nimiq Pay's `sign()` does not sign the bare message. The wallet hashes
    // and/or wraps it first, and the exact framing is not documented — the
    // provider reference only says "hex strings". Guessing one encoding meant
    // every genuine signature was rejected while the challenge was issued and
    // the user had approved the dialog, so the failure looked like a broken
    // backend.
    //
    // Every candidate below is a valid signature over *this* message and *this*
    // challenge, made with the key behind the claimed address, so accepting any
    // of them proves exactly the same thing. The security property — that only
    // the holder of the private key could have produced it — is unaffected.
    const candidates: Uint8Array[] = [
      raw,
      blake2b(raw, { dkLen: 32 }),
    ]

    // Bitcoin-style signed-message framing, which Nimiq's message signing
    // follows. Both the plain and length-prefixed forms, raw and hashed.
    const text = buildAuthMessage(message)
    for (const prefix of ['\x16Nimiq Signed Message:\n', 'Nimiq Signed Message:\n']) {
      const framed = new TextEncoder().encode(
        `${prefix}${new TextEncoder().encode(text).length}${text}`,
      )
      candidates.push(framed, blake2b(framed, { dkLen: 32 }))
    }

    return candidates.some((payload) =>
      ed25519.verify(signature, payload, publicKey),
    )
  } catch {
    return false
  }
}

/* ── Stateless session tokens (HMAC-SHA256) ──────────────────────────────── */

const encoder = new TextEncoder()
const TOKEN_TTL_MS = 12 * 60 * 60_000

function base64url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64urlDecode(value: string): string {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  return atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
}

async function hmac(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data))
  return new Uint8Array(signature)
}

function secret(): string {
  const value = Deno.env.get('AUTH_SECRET')
  if (!value) throw new Error('AUTH_SECRET is not configured')
  return value
}

/** Issue a signed token binding a wallet address to an expiry. */
export async function issueToken(address: string): Promise<string> {
  const payload = JSON.stringify({
    a: nimiqIdentity(address),
    exp: Date.now() + TOKEN_TTL_MS,
  })
  const encoded = base64url(encoder.encode(payload))
  const mac = base64url(await hmac(secret(), encoded))
  return `${encoded}.${mac}`
}

/** Verify a token and return the acting address, or null. */
export async function verifyToken(token: unknown): Promise<string | null> {
  if (typeof token !== 'string' || !token.includes('.')) return null

  const [encoded, mac] = token.split('.')
  if (!encoded || !mac) return null

  try {
    const expected = base64url(await hmac(secret(), encoded))
    if (expected !== mac) return null

    const payload = JSON.parse(base64urlDecode(encoded)) as {
      a?: string
      exp?: number
    }
    if (!payload.a || !payload.exp || payload.exp < Date.now()) return null
    if (!isValidNimiqAddress(payload.a)) return null

    return nimiqIdentity(payload.a)
  } catch {
    return null
  }
}

/**
 * Extract the session token from a request.
 *
 * The explicit body token takes precedence: supabase-js automatically sets the
 * `Authorization` header to the project anon key, so that header must never be
 * used as our token. The header is only a fallback for direct API calls, and
 * only when it matches our two-part HMAC token shape (never a three-part JWT).
 */
export function readToken(request: Request, body?: unknown): unknown {
  if (body && typeof body === 'object' && 'auth_token' in body) {
    const value = (body as { auth_token?: unknown }).auth_token
    if (typeof value === 'string' && value.length > 0) return value
  }

  const header = request.headers.get('authorization')
  if (header?.toLowerCase().startsWith('bearer ')) {
    const value = header.slice(7).trim()
    if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)) return value
  }

  return null
}
