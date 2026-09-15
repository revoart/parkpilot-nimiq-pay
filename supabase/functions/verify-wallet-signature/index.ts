import { createClient } from 'npm:@supabase/supabase-js@2'

import { errorResponse, json, preflight } from '../_shared/http.ts'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface VerifyIdentityBody {
  identity_id?: string
  challenge?: string
  nmiq_address?: string | null
  public_key?: string
  signature?: string
}

function hexToBytes(value: string): Uint8Array {
  const clean = value.startsWith('0x') ? value.slice(2) : value
  if (!/^[0-9a-fA-F]+$/.test(clean) || clean.length % 2 !== 0) {
    throw new Error('Malformed hex value')
  }
  const bytes = new Uint8Array(clean.length / 2)
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

/**
 * Best-effort Ed25519 verification using the standard Web Crypto API.
 * Nimiq signatures are Ed25519 over the SHA-256 hash of the message. If the
 * environment cannot verify, the identity is still recorded as a receipt —
 * this flow is secondary and must never block parking or payment.
 */
async function verifyEd25519(
  publicKeyHex: string,
  signatureHex: string,
  message: string,
): Promise<boolean> {
  try {
    const publicKey = hexToBytes(publicKeyHex)
    const signature = hexToBytes(signatureHex)
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(message),
    )
    const key = await crypto.subtle.importKey(
      'raw',
      publicKey,
      { name: 'Ed25519' },
      false,
      ['verify'],
    )
    return await crypto.subtle.verify({ name: 'Ed25519' }, key, signature, digest)
  } catch {
    return false
  }
}

Deno.serve(async (request) => {
  const options = preflight(request)
  if (options) return options
  if (request.method !== 'POST') {
    return errorResponse(request, 'Method not allowed', 405)
  }

  try {
    const body = (await request.json().catch(() => null)) as
      | VerifyIdentityBody
      | null
    if (!body) return errorResponse(request, 'Invalid JSON body.')

    const { identity_id, challenge, public_key, signature } = body
    if (!identity_id || !UUID_RE.test(identity_id)) {
      return errorResponse(request, 'Invalid identity_id.')
    }
    if (!challenge) return errorResponse(request, 'Missing challenge.')
    if (!public_key || !signature) {
      return errorResponse(request, 'Missing public key or signature.')
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: identity, error } = await supabase
      .from('wallet_identities')
      .select('id, challenge')
      .eq('id', identity_id)
      .single()

    if (error || !identity) {
      return errorResponse(request, 'Challenge not found.', 404)
    }
    if (identity.challenge !== challenge) {
      return errorResponse(request, 'Challenge does not match.', 409)
    }

    const message = [
      'ParkPilot wallet verification',
      `Challenge: ${challenge}`,
      'Purpose: Verify control of this Nimiq wallet for your ParkPilot account.',
    ].join('\n')

    const verified = await verifyEd25519(public_key, signature, message)

    await supabase
      .from('wallet_identities')
      .update({
        nmiq_address: body.nmiq_address ?? null,
        public_key,
        signature,
        verified_at: verified ? new Date().toISOString() : null,
      })
      .eq('id', identity_id)

    return json(request, { verified, identity_id })
  } catch (error) {
    console.error('verify-wallet-signature failed', error)
    return errorResponse(
      request,
      error instanceof Error ? error.message : 'Unexpected error',
      500,
    )
  }
})
