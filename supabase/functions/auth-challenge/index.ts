import { createClient } from 'npm:@supabase/supabase-js@2'

import { buildAuthMessage, isValidAddress, nimiqIdentity } from '../_shared/auth.ts'
import { errorResponse, json, preflight } from '../_shared/http.ts'

const CHALLENGE_TTL_MS = 10 * 60_000

function randomNonce(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Issues a one-time sign-in challenge.
 *
 * Returns the exact text to sign, not structured data: Nimiq Pay's `sign()`
 * takes a string, and the wallet's approval dialog shows it verbatim, so the
 * user can read what they are authorising.
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
      message: buildAuthMessage({ address, nonce, issuedAt }),
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
