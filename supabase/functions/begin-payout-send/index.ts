import { createClient } from 'npm:@supabase/supabase-js@2'

import { readToken, verifyToken } from '../_shared/auth.ts'
import { errorResponse, json, preflight } from '../_shared/http.ts'
import { isAuthorizedSettler, logPayoutEvent } from '../_shared/payouts.ts'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface Body {
  evm_address?: string
  auth_token?: string
  payout_id?: string
}

/**
 * Claim a payout for sending, or hand back an interrupted one to resume.
 *
 * The claim itself (kill switch, caps, single-flight) lives in the
 * `claim_payout_for_send` SQL function so it is one atomic statement — an
 * Edge Function reading and then writing could interleave with another.
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

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { allowed } = await isAuthorizedSettler(supabase, caller)
    if (!allowed) return errorResponse(request, 'Not authorized.', 403)

    // Resume: an interrupted send already holds signed bytes. Handing them back
    // is what makes a retry safe — the script re-broadcasts the identical
    // transaction rather than signing a new one and paying twice.
    const { data: existing } = await supabase
      .from('payouts')
      .select(
        'id, host_address, payout_address, amount_nim, requested_at, status, raw_tx, tx_hash, send_nonce',
      )
      .eq('id', payoutId)
      .maybeSingle()

    if (existing?.status === 'sending' && existing.raw_tx) {
      return json(request, {
        resume: true,
        payout: {
          id: existing.id,
          host_address: existing.host_address,
          payout_address: existing.payout_address,
          amount_nim: Number(existing.amount_nim),
          requested_at: existing.requested_at,
        },
        raw_tx: existing.raw_tx,
        tx_hash: existing.tx_hash,
        send_nonce: existing.send_nonce,
      })
    }

    const { data, error } = await supabase.rpc('claim_payout_for_send', {
      p_payout_id: payoutId,
    })

    if (error) {
      // The function raises readable messages for expected rejections.
      const message = (error.message ?? 'Could not start the payout.')
        .replace(/^.*?:\s*/, '')
        .trim()
      return errorResponse(request, message || 'Could not start the payout.', 409)
    }

    const payout = Array.isArray(data) ? data[0] : data
    if (!payout) {
      return errorResponse(request, 'Could not start the payout.', 500)
    }

    await logPayoutEvent(supabase, payoutId, 'claimed', { by: caller })

    return json(request, {
      resume: false,
      payout: {
        id: payout.id,
        host_address: payout.host_address,
        payout_address: payout.payout_address,
        amount_nim: Number(payout.amount_nim),
        requested_at: payout.requested_at,
      },
    })
  } catch (error) {
    console.error('begin-payout-send failed', error)
    return errorResponse(
      request,
      error instanceof Error ? error.message : 'Unexpected error',
      500,
    )
  }
})
