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
  reason?: string
}

/**
 * Mark a claimed payout failed, releasing it from the in-flight state.
 *
 * Needed because a payout stuck in `sending` blocks every other send (that is
 * what keeps two transactions from taking the same nonce). Without a way to
 * clear it, one bad send would wedge the whole queue.
 *
 * Deliberately refuses to touch a payout that already has a transaction hash —
 * if something was broadcast, it must be settled through `mark-payout-paid`,
 * not written off.
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

    const reason = (body.reason ?? '').trim().slice(0, 300) || 'Marked failed.'

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { allowed } = await isAuthorizedSettler(supabase, caller)
    if (!allowed) return errorResponse(request, 'Not authorized.', 403)

    const { data: payout } = await supabase
      .from('payouts')
      .select('id, status, tx_hash')
      .eq('id', payoutId)
      .maybeSingle()

    if (!payout) return errorResponse(request, 'Payout not found.', 404)

    if (payout.tx_hash) {
      return errorResponse(
        request,
        'That payout already has a transaction and must be settled, not failed.',
        409,
      )
    }
    if (payout.status === 'paid') {
      return errorResponse(request, 'That payout is already paid.', 409)
    }

    const { error } = await supabase
      .from('payouts')
      .update({ status: 'failed', failure_reason: reason })
      .eq('id', payoutId)
      .is('tx_hash', null)

    if (error) throw error

    await logPayoutEvent(supabase, payoutId, 'failed', { reason, by: caller })

    return json(request, { id: payoutId, status: 'failed' })
  } catch (error) {
    console.error('fail-payout failed', error)
    return errorResponse(
      request,
      error instanceof Error ? error.message : 'Unexpected error',
      500,
    )
  }
})
