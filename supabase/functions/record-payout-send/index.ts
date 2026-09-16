import { createClient } from 'npm:@supabase/supabase-js@2'

import { readToken, verifyToken } from '../_shared/auth.ts'
import { errorResponse, json, preflight } from '../_shared/http.ts'
import { isAuthorizedSettler, logPayoutEvent } from '../_shared/payouts.ts'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/
const RAW_TX_RE = /^0x[0-9a-fA-F]+$/

interface Body {
  evm_address?: string
  auth_token?: string
  payout_id?: string
  tx_hash?: string
  raw_tx?: string
  send_nonce?: number
}

/**
 * Persist the signed transaction BEFORE it is broadcast.
 *
 * This is the single most important call in the whole flow. The window between
 * broadcasting and recording the hash is where a crash turns a retry into a
 * double payment; storing the signed bytes first closes it, because a signed
 * transaction is deterministic — same bytes, same hash — so re-broadcasting is
 * a no-op rather than a second payment.
 *
 * Idempotent: writing the same hash twice is accepted, and a different hash for
 * an already-recorded payout is rejected.
 */
Deno.serve(async (request) => {
  const options = preflight(request)
  if (options) return options
  if (request.method !== 'POST') {
    return errorResponse(request, 'Method not allowed', 405)
  }

  try {
    const body = (await request.json().catch(() => null)) as Body | null
    if (!body) return errorResponse(request, 'Invalid JSON body.')

    const caller = await verifyToken(readToken(request, body))
    if (!caller) {
      return errorResponse(request, 'Sign in with your wallet to continue.', 401)
    }

    const payoutId = (body.payout_id ?? '').trim()
    if (!UUID_RE.test(payoutId)) {
      return errorResponse(request, 'Invalid payout id.')
    }
    if (!body.tx_hash || !TX_HASH_RE.test(body.tx_hash)) {
      return errorResponse(request, 'Invalid transaction hash.')
    }
    if (!body.raw_tx || !RAW_TX_RE.test(body.raw_tx)) {
      return errorResponse(request, 'Invalid signed transaction.')
    }
    const nonce = Number(body.send_nonce)
    if (!Number.isInteger(nonce) || nonce < 0) {
      return errorResponse(request, 'Invalid nonce.')
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { allowed } = await isAuthorizedSettler(supabase, caller)
    if (!allowed) return errorResponse(request, 'Not authorized.', 403)

    const { data: payout } = await supabase
      .from('payouts')
      .select('id, status, tx_hash, raw_tx')
      .eq('id', payoutId)
      .maybeSingle()

    if (!payout) return errorResponse(request, 'Payout not found.', 404)

    // Already recorded. Accept only the identical transaction, so a genuine
    // resume is a no-op while a different one is refused.
    if (payout.tx_hash) {
      if (payout.tx_hash.toLowerCase() === body.tx_hash.toLowerCase()) {
        return json(request, { recorded: true, already: true, tx_hash: payout.tx_hash })
      }
      return errorResponse(
        request,
        'A different transaction is already recorded for this payout.',
        409,
      )
    }

    if (payout.status !== 'sending') {
      return errorResponse(
        request,
        'That payout has not been claimed for sending.',
        409,
      )
    }

    const { error } = await supabase
      .from('payouts')
      .update({
        tx_hash: body.tx_hash,
        raw_tx: body.raw_tx,
        send_nonce: nonce,
      })
      .eq('id', payoutId)
      .is('tx_hash', null)

    if (error) throw error

    await logPayoutEvent(supabase, payoutId, 'signed', {
      tx_hash: body.tx_hash,
      send_nonce: nonce,
    })

    return json(request, { recorded: true, tx_hash: body.tx_hash })
  } catch (error) {
    console.error('record-payout-send failed', error)
    return errorResponse(
      request,
      error instanceof Error ? error.message : 'Unexpected error',
      500,
    )
  }
})
