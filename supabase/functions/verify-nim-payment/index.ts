import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

import { errorResponse, json, preflight } from '../_shared/http.ts'
import { creditPayment } from '../_shared/ledger.ts'
import {
  NIMIQ_MAINNET_ID,
  NimiqRpcError,
  getNimiqTransaction,
  isValidNimiqAddress,
  nimToLuna,
  normalizeNimiqAddress,
} from '../_shared/nimiq.ts'

/**
 * Server-authoritative verification of a NIM payment.
 *
 * The client sends a transaction hash; nothing it says about the amount,
 * recipient or sender is trusted. Everything is re-read from the chain.
 *
 * Two behaviours matter more than the happy path:
 *
 *   * A transaction the network has not seen yet is *pending*, not failed. The
 *     client polls, so "not found" must keep the reservation open rather than
 *     cancelling it.
 *
 *   * A transaction that is mined but not yet deep enough is also pending. Money
 *     must never be credited on a transaction that could still be reverted.
 *
 * Nimiq has no token contract and no gas token — a basic transaction moves the
 * native coin, so verification is a direct sender/recipient/amount check.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** Nimiq hashes are 32 bytes of hex, with no 0x prefix. */
const TX_HASH_RE = /^(0x)?[0-9a-fA-F]{64}$/

const DEFAULT_MIN_CONFIRMATIONS = 2

interface VerifyBody {
  reservation_id?: string
  tx_hash?: string
}

interface RecordPaymentParams {
  reservationId: string
  senderAddress: string
  recipientAddress: string
  amountLuna: string
  amountNim: string
  txHash: string
  status: string
  blockNumber: number | null
  confirmedAt: string | null
}

async function recordPayment(
  supabase: SupabaseClient,
  params: RecordPaymentParams,
): Promise<string> {
  const normalizedHash = params.txHash.replace(/^0x/i, '').toLowerCase()

  const { data: existing } = await supabase
    .from('payments')
    .select('id')
    .eq('tx_hash', normalizedHash)
    .maybeSingle()

  if (existing) {
    await supabase
      .from('payments')
      .update({
        status: params.status,
        block_number: params.blockNumber,
        confirmed_at: params.confirmedAt,
      })
      .eq('id', existing.id)
    return existing.id
  }

  const { data, error } = await supabase
    .from('payments')
    .insert({
      reservation_id: params.reservationId,
      chain: 'nimiq',
      token: 'NIM',
      // Native coin: no contract. The column is nullable for exactly this.
      token_contract: null,
      sender_address: params.senderAddress,
      recipient_address: params.recipientAddress,
      amount_raw: params.amountLuna,
      amount_nim: params.amountNim,
      tx_hash: normalizedHash,
      status: params.status,
      submitted_at: new Date().toISOString(),
      block_number: params.blockNumber,
      confirmed_at: params.confirmedAt,
    })
    .select('id')
    .single()

  if (error) {
    // 23505 = unique_violation: a concurrent request inserted first. Re-read it.
    if (error.code === '23505') {
      const { data: raced } = await supabase
        .from('payments')
        .select('id')
        .eq('tx_hash', normalizedHash)
        .maybeSingle()
      if (raced) return raced.id
    }
    throw error
  }

  return data.id
}

async function logEvent(
  supabase: SupabaseClient,
  paymentId: string,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await supabase
    .from('payment_events')
    .insert({ payment_id: paymentId, event_type: eventType, payload })
}

Deno.serve(async (request) => {
  const options = preflight(request)
  if (options) return options
  if (request.method !== 'POST') {
    return errorResponse(request, 'Method not allowed', 405)
  }

  try {
    const body = (await request.json().catch(() => null)) as VerifyBody | null
    if (!body) return errorResponse(request, 'Invalid JSON body.')

    const { reservation_id, tx_hash } = body
    if (!reservation_id || !UUID_RE.test(reservation_id)) {
      return errorResponse(request, 'Invalid reservation_id.')
    }
    if (!tx_hash || !TX_HASH_RE.test(tx_hash)) {
      return errorResponse(request, 'Invalid transaction hash.')
    }

    const hash = tx_hash.replace(/^0x/i, '').toLowerCase()
    const explorer =
      Deno.env.get('NIMIQ_EXPLORER_URL') ?? 'https://nimiq.watch'
    const explorerUrl = `${explorer}/#${hash}`

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Idempotency — a confirmed hash is never processed twice.
    const { data: existing } = await supabase
      .from('payments')
      .select('id, status, reservation_id, block_number, tx_hash')
      .eq('tx_hash', hash)
      .maybeSingle()

    if (existing?.status === 'payment_confirmed') {
      const { data: settled } = await supabase
        .from('reservations')
        .select('status')
        .eq('id', existing.reservation_id)
        .single()
      return json(request, {
        status: 'payment_confirmed',
        reservation_status: settled?.status ?? 'reservation_confirmed',
        tx_hash: hash,
        block_number: existing.block_number,
        explorer_url: explorerUrl,
      })
    }

    const { data: reservation, error: reservationError } = await supabase
      .from('reservations')
      .select(
        'id, parking_space_id, nimiq_address, amount_nim, status, recipient_address, host_amount_nim, fee_amount_nim, parking_spaces ( owner_nimiq_address )',
      )
      .eq('id', reservation_id)
      .single()

    if (reservationError || !reservation) {
      return errorResponse(request, 'Reservation not found.', 404)
    }
    if (reservation.status === 'reservation_cancelled') {
      return errorResponse(request, 'This reservation was cancelled.', 409)
    }

    const embedded = reservation.parking_spaces as
      | { owner_nimiq_address?: string | null }
      | { owner_nimiq_address?: string | null }[]
      | null
    const hostAddress = Array.isArray(embedded)
      ? embedded[0]?.owner_nimiq_address
      : embedded?.owner_nimiq_address

    const recipientAddress = reservation.recipient_address
    if (!isValidNimiqAddress(recipientAddress)) {
      return errorResponse(request, 'Reservation recipient is misconfigured.', 500)
    }
    if (!isValidNimiqAddress(reservation.nimiq_address)) {
      return errorResponse(
        request,
        'This reservation has no Nimiq payer address on file.',
        409,
      )
    }

    const amountNim = String(reservation.amount_nim)
    const expectedLuna = nimToLuna(amountNim)

    const { data: settings } = await supabase
      .from('platform_settings')
      .select('key, value')
      .in('key', ['min_payment_confirmations', 'nimiq_network_id'])

    const readSetting = (key: string, fallback: number): number => {
      const row = (settings ?? []).find((entry) => entry.key === key)
      const value = Number(row?.value)
      return Number.isFinite(value) ? value : fallback
    }

    const minConfirmations = readSetting(
      'min_payment_confirmations',
      DEFAULT_MIN_CONFIRMATIONS,
    )
    const expectedNetworkId = readSetting('nimiq_network_id', NIMIQ_MAINNET_ID)

    const pendingResponse = async (
      status: string,
      reason?: string,
    ): Promise<Response> => {
      const paymentId = await recordPayment(supabase, {
        reservationId: reservation.id,
        senderAddress: normalizeNimiqAddress(reservation.nimiq_address),
        recipientAddress: normalizeNimiqAddress(recipientAddress),
        amountLuna: expectedLuna.toString(),
        amountNim,
        txHash: hash,
        status: 'payment_submitted',
        blockNumber: null,
        confirmedAt: null,
      })
      await logEvent(supabase, paymentId, 'submitted', { tx_hash: hash })

      return json(request, {
        status,
        reservation_status: 'reservation_pending',
        tx_hash: hash,
        block_number: null,
        explorer_url: explorerUrl,
        ...(reason ? { reason } : {}),
      })
    }

    // Anything that makes the payment unrecoverable cancels the reservation so
    // the slot frees up, rather than holding a slot the driver cannot pay for.
    const failedResponse = async (
      reason: string,
      receivedLuna?: bigint,
    ): Promise<Response> => {
      const paymentId = await recordPayment(supabase, {
        reservationId: reservation.id,
        senderAddress: normalizeNimiqAddress(reservation.nimiq_address),
        recipientAddress: normalizeNimiqAddress(recipientAddress),
        amountLuna: (receivedLuna ?? expectedLuna).toString(),
        amountNim,
        txHash: hash,
        status: 'payment_failed',
        blockNumber: null,
        confirmedAt: null,
      })
      await logEvent(supabase, paymentId, 'failed', {
        reason,
        ...(receivedLuna ? { received_luna: receivedLuna.toString() } : {}),
      })
      await supabase
        .from('reservations')
        .update({ status: 'reservation_cancelled' })
        .eq('id', reservation.id)

      return json(request, {
        status: 'payment_failed',
        reservation_status: 'reservation_cancelled',
        tx_hash: hash,
        block_number: null,
        explorer_url: explorerUrl,
        reason,
      })
    }

    let transaction
    try {
      transaction = await getNimiqTransaction(hash)
    } catch (error) {
      // An unreachable node is not a failed payment. Leave it pending so the
      // client can keep polling rather than cancelling a reservation the driver
      // may well have paid.
      if (error instanceof NimiqRpcError) {
        console.error('verify-nim-payment: node error', error.message)
        return await pendingResponse(
          'payment_submitted',
          'The Nimiq network is not reachable right now.',
        )
      }
      throw error
    }

    // Not mined yet — still in the mempool, or not relayed yet.
    if (!transaction) {
      return await pendingResponse('payment_submitted')
    }

    const expectedRecipient = normalizeNimiqAddress(recipientAddress)
    const actualRecipient = normalizeNimiqAddress(transaction.to)
    const expectedSender = normalizeNimiqAddress(reservation.nimiq_address)
    const actualSender = normalizeNimiqAddress(transaction.from)

    // A transaction carries the network it was signed for. If it does not match
    // ours, this is a payment for a different chain that merely looks like one —
    // Nimiq refuses such a transaction as "Foreign Network" — and treating it as
    // a real payment would credit a host for money that never arrived here.
    if (
      typeof transaction.networkId === 'number' &&
      transaction.networkId !== expectedNetworkId
    ) {
      return await failedResponse(
        `That transaction was signed for a different Nimiq network (${transaction.networkId}, expected ${expectedNetworkId}).`,
      )
    }

    if (actualRecipient !== expectedRecipient) {
      return await failedResponse(
        'That transaction did not pay this reservation’s address.',
      )
    }
    if (actualSender !== expectedSender) {
      return await failedResponse(
        'That transaction was sent from a different account.',
      )
    }
    if (!transaction.executionResult) {
      return await failedResponse('The transaction failed on-chain.')
    }

    const receivedLuna = BigInt(transaction.value)
    if (receivedLuna < expectedLuna) {
      return await failedResponse(
        'The transferred amount is less than the reservation amount.',
        receivedLuna,
      )
    }

    // Mined and correct, but not yet deep enough to be treated as settled.
    if (transaction.confirmations < minConfirmations) {
      return await pendingResponse(
        'payment_submitted',
        `Waiting for ${minConfirmations} confirmation(s).`,
      )
    }

    const confirmedAt = new Date().toISOString()
    const paymentId = await recordPayment(supabase, {
      reservationId: reservation.id,
      senderAddress: expectedSender,
      recipientAddress: expectedRecipient,
      amountLuna: receivedLuna.toString(),
      amountNim,
      txHash: hash,
      status: 'payment_confirmed',
      blockNumber: transaction.blockNumber ?? null,
      confirmedAt,
    })
    await logEvent(supabase, paymentId, 'confirmed', {
      block_number: transaction.blockNumber,
      amount_luna: receivedLuna.toString(),
      network_id: transaction.networkId ?? NIMIQ_MAINNET_ID,
    })

    await supabase
      .from('reservations')
      .update({ status: 'reservation_confirmed' })
      .eq('id', reservation.id)

    // Credit the internal ledger: host earning (net) + treasury fee.
    if (typeof hostAddress === 'string' && hostAddress.length > 0) {
      const hostAmountNim = String(reservation.host_amount_nim ?? amountNim)
      const feeAmountNim = String(reservation.fee_amount_nim ?? '0')
      await creditPayment(supabase, {
        hostAddress,
        treasuryAddress: expectedRecipient,
        reservationId: reservation.id,
        paymentId,
        hostAmountNim,
        hostAmountRaw: nimToLuna(hostAmountNim),
        feeAmountNim,
        feeAmountRaw: nimToLuna(feeAmountNim),
      })
    }

    return json(request, {
      status: 'payment_confirmed',
      reservation_status: 'reservation_confirmed',
      tx_hash: hash,
      block_number: transaction.blockNumber ?? null,
      explorer_url: explorerUrl,
    })
  } catch (error) {
    console.error('verify-nim-payment failed', error)
    return errorResponse(
      request,
      error instanceof Error ? error.message : 'Unexpected error',
      500,
    )
  }
})
