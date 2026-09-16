import { createClient } from 'npm:@supabase/supabase-js@2'

import { readToken, verifyToken } from '../_shared/auth.ts'
import { isValidEvmAddress } from '../_shared/evm.ts'
import { errorResponse, json, preflight } from '../_shared/http.ts'

interface Body {
  amount_nim?: number | string
  payout_address?: string
}

/**
 * Host requests a withdrawal of available funds to an external wallet.
 *
 * The balance check and the insert happen inside the `request_payout` Postgres
 * function, which locks the host's ledger account — so concurrent requests
 * cannot both pass the check and over-request the same funds.
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

    const owner = await verifyToken(readToken(request, body))
    if (!owner) {
      return errorResponse(
        request,
        'Sign in with your wallet to continue.',
        401,
      )
    }

    if (!isValidEvmAddress(body.payout_address)) {
      return errorResponse(request, 'Invalid payout address.')
    }

    const amount = Number(body.amount_nim)
    if (!Number.isFinite(amount) || amount <= 0) {
      return errorResponse(request, 'Enter a valid amount.')
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data, error } = await supabase.rpc('request_payout', {
      p_host: owner,
      p_amount: amount,
      p_payout_address: body.payout_address,
    })

    if (error) {
      // The function raises readable messages for expected rejections.
      const message = (error.message ?? 'Could not request payout.')
        .replace(/^.*?:\s*/, '')
        .trim()
      return errorResponse(request, message || 'Could not request payout.', 400)
    }

    const payout = Array.isArray(data) ? data[0] : data
    if (!payout) {
      return errorResponse(request, 'Could not request payout.', 500)
    }

    return json(request, { payout })
  } catch (error) {
    console.error('request-payout failed', error)
    return errorResponse(
      request,
      error instanceof Error ? error.message : 'Unexpected error',
      500,
    )
  }
})
