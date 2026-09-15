import { createClient } from 'npm:@supabase/supabase-js@2'

import { buildTypedData, isValidAddress } from '../_shared/auth.ts'
import { errorResponse, json, preflight } from '../_shared/http.ts'

const CHALLENGE_TTL_MS = 10 * 60_000

function randomNonce(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

/** Issues a one-time EIP-712 challenge for the wallet to sign. */
Deno.serve(async (request) => {
  const options = preflight(request)
  if (options) return options
  if (request.method !== 'POST') {
    return errorResponse(request, 'Method not allowed', 405)
  }

  try {
    const body = (await request.json().catch(() => null)) as {
      evm_address?: string
    } | null
    if (!body) return errorResponse(request, 'Invalid JSON body.')
    if (!isValidAddress(body.evm_address)) {
      return errorResponse(request, 'Invalid wallet address.')
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
    const address = body.evm_address as `0x${string}`

    const { error } = await supabase.from('auth_challenges').insert({
      evm_address: address.toLowerCase(),
      nonce,
      expires_at: expiresAt,
    })
    if (error) throw error

    return json(request, {
      nonce,
      issued_at: issuedAt,
      expires_at: expiresAt,
      typed_data: buildTypedData({ address, nonce, issuedAt }),
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
