import { createClient } from 'npm:@supabase/supabase-js@2'

import { isValidAddress, nimiqIdentity } from '../_shared/auth.ts'
import { errorResponse, json, preflight } from '../_shared/http.ts'
import { getPlatformConfig } from '../_shared/ledger.ts'

const CHALLENGE_TTL_MS = 10 * 60_000

/**
 * Proof of ownership is a transfer, not a signature.
 *
 * Nimiq Pay's `sign()` returns a signature that neither Nimiq's own verifier
 * nor standard Ed25519 can validate against any message we sent, so signing is
 * not a usable foundation. A 1 Luna transfer to the treasury proves the same
 * thing and cannot be forged: only the holder of the private key for an address
 * can move funds from it. The nonce travels as transaction data, binding the
 * transfer to this one challenge.
 */
export const AUTH_AMOUNT_LUNA = 1

function randomNonce(): string {
  // 8 bytes → 16 hex characters. Sent as transaction data, so it must stay
  // well inside Nimiq's 64-byte data limit.
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Issues a one-time sign-in challenge.
 *
 * Returns what the wallet must send, and where: the user makes a tiny transfer
 * to the platform treasury with the nonce attached, and `auth-verify` confirms
 * it on-chain.
 */
Deno.serve(async (request) => {
  const options = preflight(request)
  if (options) return options
  if (request.method !== 'POST') {
    return errorResponse(request, 'Method not allowed', 405)
  }

  try {
    const body = (await request.json().catch(() => null)) as {
      nimiq_address?: string
    } | null
    if (!body) return errorResponse(request, 'Invalid JSON body.')

    const address = body.nimiq_address
    if (!isValidAddress(address)) {
      return errorResponse(request, 'Invalid Nimiq address.')
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const config = await getPlatformConfig(supabase)
    if (!config.treasuryAddress || !isValidAddress(config.treasuryAddress)) {
      return errorResponse(request, 'The platform has no receiving address.', 500)
    }

    // Housekeeping — drop used/expired challenges.
    await supabase.rpc('expire_auth_challenges')

    const nonce = randomNonce()
    const issuedAt = new Date().toISOString()
    const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS).toISOString()

    const { error } = await supabase.from('auth_challenges').insert({
      nimiq_address: nimiqIdentity(address),
      nonce,
      expires_at: expiresAt,
    })
    if (error) throw error

    return json(request, {
      nonce,
      issued_at: issuedAt,
      expires_at: expiresAt,
      // What the wallet must send, and where.
      recipient: config.treasuryAddress,
      amount_luna: AUTH_AMOUNT_LUNA,
      data: nonce,
    })
  } catch (error) {
    console.error('auth-challenge failed', error)
    return errorResponse(
      request,
      error instanceof Error ? error.message : 'Unexpected error',
      500,
    )
  }
})
