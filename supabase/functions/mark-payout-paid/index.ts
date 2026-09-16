import { createClient } from 'npm:@supabase/supabase-js@2'

import { readToken, verifyToken } from '../_shared/auth.ts'
import { errorResponse, json, preflight } from '../_shared/http.ts'
import {
  ensureAccount,
  getPlatformConfig,
  postLedgerEntry,
} from '../_shared/ledger.ts'
import {
  getNimiqTransaction,
  isValidNimiqAddress,
  nimToLuna,
  normalizeNimiqAddress,
} from '../_shared/nimiq.ts'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** Nimiq hashes are 32 bytes of hex, with no 0x prefix. */
const TX_HASH_RE = /^(0x)?[0-9a-fA-F]{64}$/

interface Body {
  payout_id?: string
  tx_hash?: string
}

/**
 * Settles a payout: verifies on-chain that the treasury actually sent NIM to
 * the host's payout address, then marks it paid and posts the ledger debit.
 *
 * Only the ParkPilot treasury wallet may call this. The transaction hash is
 * never trusted on its own — without the receipt check a mistyped hash would
 * settle a payout in the books while no money moved.
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

    const config = await getPlatformConfig(supabase)

    // The treasury address settles directly; when the treasury is a multisig
    // (e.g. a Safe) the caller is a signer, so operators are allow-listed.
    //
    // Compared case-insensitively, which is what Nimiq addresses need. The
    // treasury account settles directly; a multisig-style setup settles through
    // an allow-listed operator instead.
    const callerAddress = caller.toLowerCase()
    const isTreasury =
      callerAddress === config.treasuryAddress.toLowerCase()
    const isOperator = config.operatorAddresses.includes(callerAddress)
    if (!isTreasury && !isOperator) {
      return errorResponse(request, 'Not authorized.', 403)
    }

    if (!body.payout_id || !UUID_RE.test(body.payout_id)) {
      return errorResponse(request, 'Invalid payout id.')
    }
    if (!body.tx_hash || !TX_HASH_RE.test(body.tx_hash)) {
      return errorResponse(request, 'Invalid transaction hash.')
    }

    const { data: payout, error } = await supabase
      .from('payouts')
      .select('id, host_address, payout_address, amount_nim, status')
      .eq('id', body.payout_id)
      .single()

    if (error || !payout) {
      return errorResponse(request, 'Payout not found.', 404)
    }
    if (payout.status === 'paid') {
      return json(request, { status: 'paid', id: payout.id, already: true })
    }
    if (payout.status === 'failed') {
      return errorResponse(
        request,
        'This payout was marked failed and cannot be settled.',
        409,
      )
    }

    const txHash = String(body.tx_hash).replace(/^0x/i, '').toLowerCase()
    const expectedLuna = nimToLuna(String(payout.amount_nim))

    const transaction = await getNimiqTransaction(txHash)

    if (!transaction) {
      return errorResponse(
        request,
        'That transaction is not on the chain yet. Try again once it is mined.',
        409,
      )
    }
    if (!transaction.executionResult) {
      return errorResponse(
        request,
        'That transaction failed on-chain, so nothing was paid.',
        400,
      )
    }

    const treasury = normalizeNimiqAddress(config.treasuryAddress)
    const recipient = normalizeNimiqAddress(payout.payout_address)

    if (!isValidNimiqAddress(payout.payout_address)) {
      return errorResponse(
        request,
        'This payout has no valid Nimiq address on file.',
        409,
      )
    }

    if (normalizeNimiqAddress(transaction.from) !== treasury) {
      return errorResponse(
        request,
        'That transaction was not sent from the ParkPilot treasury.',
        400,
      )
    }

    if (normalizeNimiqAddress(transaction.to) !== recipient) {
      return errorResponse(
        request,
        `That transaction did not pay ${payout.payout_address}.`,
        400,
      )
    }

    const paidLuna = BigInt(transaction.value)
    if (paidLuna < expectedLuna) {
      return errorResponse(
        request,
        `That transaction sent ${transaction.value} Luna but this payout is ${String(payout.amount_nim)} NIM.`,
        400,
      )
    }

    const blockNumber = transaction.blockNumber ?? null
    const completedAt = new Date().toISOString()

    const { error: updateError } = await supabase
      .from('payouts')
      .update({
        status: 'paid',
        tx_hash: txHash,
        block_number: blockNumber,
        completed_at: completedAt,
      })
      .eq('id', payout.id)

    if (updateError) {
      // 23505 = the hash is already attached to another payout.
      if (updateError.code === '23505') {
        return errorResponse(
          request,
          'That transaction has already been used for another payout.',
          409,
        )
      }
      throw updateError
    }

    const accountId = await ensureAccount(supabase, 'host', payout.host_address)
    const amountNim = String(payout.amount_nim)

    await postLedgerEntry(supabase, {
      accountId,
      entryType: 'payout',
      direction: 'debit',
      amountNim,
      amountRaw: nimToLuna(amountNim),
      payoutId: payout.id,
    })

    return json(request, {
      status: 'paid',
      id: payout.id,
      tx_hash: txHash,
      block_number: blockNumber,
    })
  } catch (error) {
    console.error('mark-payout-paid failed', error)
    return errorResponse(
      request,
      error instanceof Error ? error.message : 'Unexpected error',
      500,
    )
  }
})
