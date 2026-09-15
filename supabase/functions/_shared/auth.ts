import { verifyTypedData } from 'npm:viem@2'

const DOMAIN = {
  name: 'ParkPilot',
  version: '1',
  chainId: 137,
} as const

export const AUTH_TYPES = {
  ParkPilotAuth: [
    { name: 'address', type: 'address' },
    { name: 'nonce', type: 'string' },
    { name: 'issuedAt', type: 'string' },
  ],
} as const

export interface AuthMessage {
  address: `0x${string}`
  nonce: string
  issuedAt: string
}

export function buildTypedData(message: AuthMessage) {
  return {
    domain: DOMAIN,
    types: AUTH_TYPES,
    primaryType: 'ParkPilotAuth' as const,
    message,
  }
}

export function isValidAddress(value: unknown): value is string {
  return typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value)
}

/** Verify an EIP-712 ParkPilotAuth signature against the claimed address. */
export async function verifyAuthSignature(
  message: AuthMessage,
  signature: string,
): Promise<boolean> {
  try {
    return await verifyTypedData({
      address: message.address,
      domain: DOMAIN,
      types: AUTH_TYPES,
      primaryType: 'ParkPilotAuth',
      message,
      signature: signature as `0x${string}`,
    })
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
    a: address.toLowerCase(),
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
    if (!isValidAddress(payload.a)) return null

    return payload.a.toLowerCase()
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
