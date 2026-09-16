import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

import { normalizeAddress } from './evm.ts'
import { getPlatformConfig, type PlatformConfig } from './ledger.ts'

/**
 * Authorization and audit for the payout-sending endpoints.
 *
 * Settling a payout is allowed for the treasury wallet itself, or for any
 * wallet on the operator allow-list (which is how a multisig treasury is
 * supported: the signers are operators).
 */
export async function isAuthorizedSettler(
  supabase: SupabaseClient,
  caller: string,
): Promise<{ allowed: boolean; config: PlatformConfig }> {
  const config = await getPlatformConfig(supabase)
  const address = normalizeAddress(caller)

  const allowed =
    address === normalizeAddress(config.treasuryAddress) ||
    config.operatorAddresses.includes(address)

  return { allowed, config }
}

export type PayoutEvent =
  | 'claimed'
  | 'signed'
  | 'broadcast'
  | 'confirmed'
  | 'failed'

/**
 * Append to the payout audit trail.
 *
 * Never throws: an audit write failing must not abort a send that has already
 * been broadcast, because the on-chain state is the source of truth and the
 * payout row still records the outcome.
 */
export async function logPayoutEvent(
  supabase: SupabaseClient,
  payoutId: string,
  event: PayoutEvent,
  detail?: Record<string, unknown>,
): Promise<void> {
  try {
    await supabase
      .from('payout_events')
      .insert({ payout_id: payoutId, event, detail: detail ?? null })
  } catch {
    // Intentionally swallowed — see above.
  }
}
