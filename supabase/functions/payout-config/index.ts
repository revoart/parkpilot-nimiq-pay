import { createClient } from 'npm:@supabase/supabase-js@2'

import { readToken, verifyToken } from '../_shared/auth.ts'
import { errorResponse, json, preflight } from '../_shared/http.ts'
import {
  LUNA_PER_NIM,
  NIMIQ_MAINNET_ID,
  resolveNimiqEndpoints,
} from '../_shared/nimiq.ts'
import { isAuthorizedSettler } from '../_shared/payouts.ts'

/**
 * Everything the local signer needs before it touches a key.
 *
 * Read-only, and deliberately the first call the script makes: it asserts the
 * configured treasury address matches the one the mnemonic derives to, and
 * refuses to continue if it does not. Checking before claiming means a
 * misconfigured signer never takes a payout it cannot send.
 */
Deno.serve(async (request) => {
  const options = preflight(request)
  if (options) return options
  if (request.method !== 'POST') {
    return errorResponse(request, 'Method not allowed', 405)
  }

  try {
    const body = (await request.json().catch(() => null)) as {
      evm_address?: string
      auth_token?: string
    } | null
    if (!body) return errorResponse(request, 'Invalid JSON body.')

    const caller = await verifyToken(readToken(request, body))
    if (!caller) {
      return errorResponse(request, 'Sign in with your wallet to continue.', 401)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { allowed, config } = await isAuthorizedSettler(supabase, caller)
    if (!allowed) return errorResponse(request, 'Not authorized.', 403)

    const { data: settings } = await supabase
      .from('platform_settings')
      .select('key, value')
      .in('key', [
        'payouts_enabled',
        'max_payout_nim',
        'daily_payout_cap_nim',
        'min_payout_nim',
      ])

    const read = (key: string, fallback: number): number => {
      const row = (settings ?? []).find((entry) => entry.key === key)
      const value = row ? Number(row.value) : NaN
      return Number.isFinite(value) ? value : fallback
    }

    const enabledRow = (settings ?? []).find(
      (entry) => entry.key === 'payouts_enabled',
    )

    return json(request, {
      treasury_address: config.treasuryAddress,
      operator_addresses: config.operatorAddresses,
      payouts_enabled: enabledRow?.value === true,
      max_payout_nim: read('max_payout_nim', 250_000),
      daily_payout_cap_nim: read('daily_payout_cap_nim', 1_250_000),
      min_payout_nim: read('min_payout_nim', 5_000),
      // Nimiq is the native coin, so the signer needs a network id and RPC
      // endpoints rather than a token contract. Nimiq Albatross mainnet is 24;
      // the old Proof-of-Work network's 42 would be rejected by peers.
      network_id: Number(Deno.env.get('NIMIQ_NETWORK_ID') ?? NIMIQ_MAINNET_ID),
      luna_per_nim: Number(LUNA_PER_NIM),
      rpc_endpoints: resolveNimiqEndpoints(),
    })
  } catch (error) {
    console.error('payout-config failed', error)
    return errorResponse(
      request,
      error instanceof Error ? error.message : 'Unexpected error',
      500,
    )
  }
})
