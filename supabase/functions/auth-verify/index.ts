import { createClient } from 'npm:@supabase/supabase-js@2'

import { issueToken } from '../_shared/auth.ts'
import { errorResponse, json, preflight } from '../_shared/http.ts'
import { getPlatformConfig } from '../_shared/ledger.ts'
import {
  NIMIQ_MAINNET_ID,
  NimiqRpcError,
  getNimiqTransaction,
  nimiqAddressesEqual,
} from '../_shared/nimiq.ts'

interface Body {
  nimiq_address?: string
  nonce?: string
  tx_hash?: string
}

const DEFAULT_MIN_CONFIRMATIONS = 2
const AUTH_AMOUNT_LUNA = 1

/** Nimiq returns transaction data as hex; decode it back to the nonce text. */
function decodeData(data: string | null | undefined): string {
  if (!data) return ''
  const cleaned = data.replace(/^0x/i, '')
  if (!/^[0-9a-fA-F]*$/.test(cleaned) || cleaned.length % 2 !== 0) {
    return data.trim()
  }
  try {
    const bytes = new Uint8Array(cleaned.length / 2)
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(cleaned.slice(i * 2, i * 2 + 2), 16)
    }
    return new TextDecoder().decode(bytes).trim()
  } catch {
    return data.trim()
  }
}

/**
 * Verifies a sign-in transfer and returns a session token.
 *
 * **The sender of the transfer is the identity.** Only the holder of the private
 * key for an address can move funds from it, so a confirmed transfer from an
 * address is proof of ownership of that address.
 *
 * This used to require the sender to equal an address the client claimed — the
 * one returned by `listAccounts()[0]`. That broke whenever the wallet's active
 * account differed from its first listed account, which is the normal case for
 * anyone with more than one account: the client claimed an empty address while
 * the wallet sent from a funded one, so every genuine transfer was rejected and
 * then retried on the next write. Real transfers were paid for and discarded.
 *
 * The nonce is what binds a transfer to one attempt. It is server-issued,
 * single-use and expiring, and it must appear in the transaction data, so an
 * older transfer cannot be replayed and nobody can claim a transfer they did
 * not send. Trusting the on-chain sender is therefore both correct and no less
 * safe than trusting the client's claim.
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

    if (!body.nonce || !body.tx_hash) {
      return errorResponse(
        request,
        'Missing challenge nonce or transaction hash.',
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Looked up by nonce alone. The nonce is unique to this attempt and bound to
    // the address it was issued for only as a note — the proof of ownership is
    // the transfer, not the claim.
    const { data: challenge, error } = await supabase
      .from('auth_challenges')
      .select('id, used, expires_at')
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

    const config = await getPlatformConfig(supabase)

    const { data: settingRows } = await supabase
      .from('platform_settings')
      .select('key, value')
      .in('key', ['min_payment_confirmations', 'nimiq_network_id'])
    const settings = new Map(
      (settingRows ?? []).map((row: { key: string; value: unknown }) => [
        row.key,
        row.value,
      ]),
    )
    const minConfirmations = Number(
      settings.get('min_payment_confirmations') ?? DEFAULT_MIN_CONFIRMATIONS,
    )
    const expectedNetworkId = Number(
      settings.get('nimiq_network_id') ?? NIMIQ_MAINNET_ID,
    )

    let transaction
    try {
      transaction = await getNimiqTransaction(body.tx_hash)
    } catch (rpcError) {
      if (rpcError instanceof NimiqRpcError) {
        return errorResponse(request, rpcError.message, 502)
      }
      throw rpcError
    }

    // A transaction the network has not seen yet is pending, not failed — the
    // wallet may have broadcast moments ago.
    if (!transaction) {
      return json(request, { status: 'pending' })
    }

    // The sender is the account being signed in. This is the identity.
    const sender = transaction.from
    if (!sender) {
      return errorResponse(request, 'That transfer has no sender.', 401)
    }

    if (!nimiqAddressesEqual(transaction.to, config.treasuryAddress)) {
      return errorResponse(request, 'That transfer was not sent to ParkPilot.', 401)
    }
    if (Number(transaction.value) < AUTH_AMOUNT_LUNA) {
      return errorResponse(request, 'That transfer was too small.', 401)
    }
    // The RPC exposes attached data as `senderData` / `recipientData`; there is
    // no `data` field. Which one carries the payload depends on the send type,
    // so both are accepted.
    const attached = transaction.recipientData ?? transaction.senderData
    if (decodeData(attached) !== body.nonce) {
      return errorResponse(request, 'That transfer does not carry this challenge.', 401)
    }
    if (transaction.networkId !== expectedNetworkId) {
      return errorResponse(request, 'That transfer was made on another network.', 401)
    }
    if (!transaction.executionResult) {
      return errorResponse(request, 'That transfer failed on-chain.', 401)
    }
    if (Number(transaction.confirmations) < minConfirmations) {
      return json(request, { status: 'pending' })
    }

    await supabase
      .from('auth_challenges')
      .update({ used: true })
      .eq('id', challenge.id)

    const token = await issueToken(sender)

    return json(request, {
      token,
      address: sender,
      tx_hash: transaction.hash,
    })
  } catch (error) {
    console.error('auth-verify failed', error)
    return errorResponse(
      request,
      error instanceof Error ? error.message : 'Unexpected error',
      500,
    )
  }
})
