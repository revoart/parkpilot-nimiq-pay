import { createClient } from 'npm:@supabase/supabase-js@2'

import { errorResponse, json, preflight } from '../_shared/http.ts'

interface ChallengeBody {
  nmiq_address?: string | null
  evm_address?: string | null
}

function randomChallenge(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  const hex = Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
  return `PARKPILOT-${hex.toUpperCase()}`
}

/**
 * Issue a server-side challenge that the user signs with their Nimiq wallet.
 * The signed challenge is stored as a wallet-backed identity receipt.
 */
Deno.serve(async (request) => {
  const options = preflight(request)
  if (options) return options
  if (request.method !== 'POST') {
    return errorResponse(request, 'Method not allowed', 405)
  }

  try {
    const body = (await request.json().catch(() => ({}))) as ChallengeBody

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const challenge = randomChallenge()

    const { data, error } = await supabase
      .from('wallet_identities')
      .insert({
        challenge,
        nmiq_address: body.nmiq_address ?? null,
        evm_address: body.evm_address ?? null,
      })
      .select('id, challenge')
      .single()

    if (error || !data) {
      throw error ?? new Error('Failed to issue challenge')
    }

    const message = [
      'ParkPilot wallet verification',
      `Challenge: ${data.challenge}`,
      'Purpose: Verify control of this Nimiq wallet for your ParkPilot account.',
    ].join('\n')

    return json(request, {
      identity_id: data.id,
      challenge: data.challenge,
      message,
    })
  } catch (error) {
    console.error('wallet-challenge failed', error)
    return errorResponse(
      request,
      error instanceof Error ? error.message : 'Unexpected error',
      500,
    )
  }
})
