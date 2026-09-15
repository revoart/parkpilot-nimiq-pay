import { createClient } from 'npm:@supabase/supabase-js@2'

import {
  isValidAddress,
  issueToken,
  verifyAuthSignature,
} from '../_shared/auth.ts'
import { errorResponse, json, preflight } from '../_shared/http.ts'

interface Body {
  evm_address?: string
  nonce?: string
  issued_at?: string
  signature?: string
}

/** Verifies the signed challenge and returns a session token. */
Deno.serve(async (request) => {
  const options = preflight(request)
  if (options) return options
  if (request.method !== 'POST') {
    return errorResponse(request, 'Method not allowed', 405)
  }

  try {
    const body = (await request.json().catch(() => null)) as Body | null
    if (!body) return errorResponse(request, 'Invalid JSON body.')
    if (!isValidAddress(body.evm_address)) {
      return errorResponse(request, 'Invalid wallet address.')
    }
    if (!body.nonce || !body.issued_at || !body.signature) {
      return errorResponse(request, 'Missing challenge, timestamp or signature.')
    }

    const address = body.evm_address.toLowerCase()

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: challenge, error } = await supabase
      .from('auth_challenges')
      .select('id, used, expires_at')
      .ilike('evm_address', address)
      .eq('nonce', body.nonce)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) throw error
    if (!challenge || challenge.used) {
      return errorResponse(request, 'Challenge not found or already used.', 401)
    }
    if (new Date(challenge.expires_at).getTime() < Date.now()) {
      return errorResponse(request, 'Challenge has expired.', 401)
    }

    const valid = await verifyAuthSignature(
      {
        address: body.evm_address as `0x${string}`,
        nonce: body.nonce,
        issuedAt: body.issued_at,
      },
      body.signature,
    )

    if (!valid) {
      return errorResponse(request, 'Signature verification failed.', 401)
    }

    await supabase
      .from('auth_challenges')
      .update({ used: true })
      .eq('id', challenge.id)

    const token = await issueToken(address)

    return json(request, { token, address })
  } catch (error) {
    console.error('auth-verify failed', error)
    return errorResponse(
      request,
      error instanceof Error ? error.message : 'Unexpected error',
      500,
    )
  }
})
