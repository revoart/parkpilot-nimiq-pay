import { createClient } from 'npm:@supabase/supabase-js@2'

import { readToken, verifyToken } from '../_shared/auth.ts'
import { errorResponse, json, preflight } from '../_shared/http.ts'
import { getHostWalletSummary, getPlatformConfig } from '../_shared/ledger.ts'

/** Host wallet: balances, payout address and recent ledger transactions. */
Deno.serve(async (request) => {
  const options = preflight(request)
  if (options) return options
  if (request.method !== 'POST') {
    return errorResponse(request, 'Method not allowed', 405)
  }

  try {
    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >

    const owner = await verifyToken(readToken(request, body))
    if (!owner) {
      return errorResponse(
        request,
        'Sign in with your wallet to continue.',
        401,
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const summary = await getHostWalletSummary(supabase, owner)
    const config = await getPlatformConfig(supabase)

    const { data: wallet } = await supabase
      .from('host_wallets')
      .select('payout_address')
      .ilike('host_address', owner)
      .maybeSingle()

    const { data: payouts } = await supabase
      .from('payouts')
      .select('id, amount_nim, status, tx_hash, block_number, requested_at, completed_at, payout_address')
      .ilike('host_address', owner)
      .order('requested_at', { ascending: false })
      .limit(20)

    return json(request, {
      ...summary,
      payout_address: wallet?.payout_address ?? null,
      min_payout_nim: config.minPayoutNim,
      fee_bps: config.feeBps,
      payouts: payouts ?? [],
    })
  } catch (error) {
    console.error('get-host-wallet failed', error)
    return errorResponse(
      request,
      error instanceof Error ? error.message : 'Unexpected error',
      500,
    )
  }
})
