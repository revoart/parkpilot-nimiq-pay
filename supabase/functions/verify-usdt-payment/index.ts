import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

import {
  decimalToRaw,
  findTransfer,
  isValidEvmAddress,
  rpc,
  type RpcReceipt,
} from '../_shared/evm.ts'
import { errorResponse, json, preflight } from '../_shared/http.ts'
import { creditPayment } from '../_shared/ledger.ts'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/

const USDT_DECIMALS = 6

interface VerifyBody {
  reservation_id?: string
  tx_hash?: string
}

interface RecordPaymentParams {
  reservationId: string
  senderAddress: string
  recipientAddress: string
  tokenContract: string
  amountRaw: string
  amountUsdt: string
  txHash: string
  status: string
  blockNumber: number | null
  confirmedAt: string | null
}

async function recordPayment(
  supabase: SupabaseClient,
  params: RecordPaymentParams,
): Promise<string> {
  const normalizedHash = params.txHash.toLowerCase()

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
      chain: 'polygon',
      token: 'USDT',
      token_contract: params.tokenContract,
      sender_address: params.senderAddress,
      recipient_address: params.recipientAddress,
      amount_raw: params.amountRaw,
      amount_usdt: params.amountUsdt,
      tx_hash: normalizedHash,
      status: params.status,
      submitted_at: new Date().toISOString(),
      block_number: params.blockNumber,
      confirmed_at: params.confirmedAt,
    })
    .select('id')
    .single()

  if (error) {
    // 23505 = unique_violation: concurrent request inserted first. Re-read it.
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

    const rpcUrl =
      Deno.env.get('POLYGON_RPC_URL') ?? 'https://polygon-rpc.com'
    const usdtContract =
      Deno.env.get('USDT_CONTRACT_ADDRESS') ??
      '0xc2132D05D31c914a87C6611C10748AEb04B58e8F'
    const explorer =
      Deno.env.get('BLOCK_EXPLORER_URL') ?? 'https://polygonscan.com'
    const expectedChainId = Number(Deno.env.get('POLYGON_CHAIN_ID') ?? 137)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Chain guard â€” the RPC endpoint must be Polygon.
    const chainIdHex = await rpc<string>(rpcUrl, 'eth_chainId')
    if (parseInt(chainIdHex, 16) !== expectedChainId) {
      return errorResponse(
        request,
        'RPC endpoint is not connected to the expected network.',
        500,
      )
    }

    const explorerUrl = `${explorer}/tx/${tx_hash}`

    // Idempotency â€” a confirmed hash is never processed twice.
    const { data: existing } = await supabase
      .from('payments')
      .select('id, status, reservation_id, block_number, tx_hash')
      .eq('tx_hash', tx_hash.toLowerCase())
      .maybeSingle()

    if (existing?.status === 'payment_confirmed') {
      const { data: reservation } = await supabase
        .from('reservations')
        .select('status')
        .eq('id', existing.reservation_id)
        .single()
      return json(request, {
        status: 'payment_confirmed',
        reservation_status: reservation?.status ?? 'reservation_confirmed',
        tx_hash: existing.tx_hash,
        block_number: existing.block_number,
        explorer_url: explorerUrl,
      })
    }

    const { data: reservation, error: reservationError } = await supabase
      .from('reservations')
      .select(
        'id, parking_space_id, evm_address, amount_usdt, status, recipient_address, host_amount_usdt, fee_amount_usdt, parking_spaces ( payment_recipient_address, owner_evm_address )',
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
      | { payment_recipient_address?: string; owner_evm_address?: string }
      | { payment_recipient_address?: string; owner_evm_address?: string }[]
      | null
    const listingRecipient = Array.isArray(embedded)
      ? embedded[0]?.payment_recipient_address
      : embedded?.payment_recipient_address
    const hostAddress = Array.isArray(embedded)
      ? embedded[0]?.owner_evm_address
      : embedded?.owner_evm_address

    // New reservations pay the ParkPilot treasury; older rows fall back to the
    // listing's recipient.
    const recipientAddress = reservation.recipient_address ?? listingRecipient

    if (!isValidEvmAddress(recipientAddress)) {
      return errorResponse(request, 'Reservation recipient is misconfigured.', 500)
    }

    const amountUsdt = String(reservation.amount_usdt)
    const expectedRaw = decimalToRaw(amountUsdt, USDT_DECIMALS)

    const receipt = await rpc<RpcReceipt | null>(
      rpcUrl,
      'eth_getTransactionReceipt',
      [tx_hash],
    )

    // Still pending in the mempool.
    if (!receipt) {
      const paymentId = await recordPayment(supabase, {
        reservationId: reservation.id,
        senderAddress: reservation.evm_address,
        recipientAddress,
        tokenContract: usdtContract,
        amountRaw: expectedRaw.toString(),
        amountUsdt,
        txHash: tx_hash,
        status: 'payment_submitted',
        blockNumber: null,
        confirmedAt: null,
      })
      await logEvent(supabase, paymentId, 'submitted', { tx_hash })
      return json(request, {
        status: 'payment_submitted',
        reservation_status: 'reservation_pending',
        tx_hash,
        block_number: null,
        explorer_url: explorerUrl,
      })
    }

    const blockNumber = receipt.blockNumber
      ? parseInt(receipt.blockNumber, 16)
      : null

    if (receipt.status !== '0x1') {
      const paymentId = await recordPayment(supabase, {
        reservationId: reservation.id,
        senderAddress: reservation.evm_address,
        recipientAddress,
        tokenContract: usdtContract,
        amountRaw: expectedRaw.toString(),
        amountUsdt,
        txHash: tx_hash,
        status: 'payment_failed',
        blockNumber,
        confirmedAt: null,
      })
      await logEvent(supabase, paymentId, 'failed', { reason: 'reverted' })
      await supabase
        .from('reservations')
        .update({ status: 'reservation_cancelled' })
        .eq('id', reservation.id)
      return json(
        request,
        {
          status: 'payment_failed',
          reservation_status: 'reservation_cancelled',
          tx_hash,
          block_number: blockNumber,
          explorer_url: explorerUrl,
          reason: 'The transaction reverted on-chain.',
        },
        200,
      )
    }

    const transfer = findTransfer(
      receipt,
      usdtContract,
      reservation.evm_address,
      recipientAddress,
    )

    if (!transfer) {
      const paymentId = await recordPayment(supabase, {
        reservationId: reservation.id,
        senderAddress: reservation.evm_address,
        recipientAddress,
        tokenContract: usdtContract,
        amountRaw: expectedRaw.toString(),
        amountUsdt,
        txHash: tx_hash,
        status: 'payment_failed',
        blockNumber,
        confirmedAt: null,
      })
      await logEvent(supabase, paymentId, 'failed', {
        reason: 'no_matching_transfer',
      })
      await supabase
        .from('reservations')
        .update({ status: 'reservation_cancelled' })
        .eq('id', reservation.id)
      return json(request, {
        status: 'payment_failed',
        reservation_status: 'reservation_cancelled',
        tx_hash,
        block_number: blockNumber,
        explorer_url: explorerUrl,
        reason: 'No matching USDT transfer was found in this transaction.',
      })
    }

    if (transfer.value < expectedRaw) {
      const paymentId = await recordPayment(supabase, {
        reservationId: reservation.id,
        senderAddress: reservation.evm_address,
        recipientAddress,
        tokenContract: usdtContract,
        amountRaw: transfer.value.toString(),
        amountUsdt,
        txHash: tx_hash,
        status: 'payment_failed',
        blockNumber,
        confirmedAt: null,
      })
      await logEvent(supabase, paymentId, 'failed', {
        reason: 'insufficient_amount',
        received: transfer.value.toString(),
        expected: expectedRaw.toString(),
      })
      await supabase
        .from('reservations')
        .update({ status: 'reservation_cancelled' })
        .eq('id', reservation.id)
      return json(request, {
        status: 'payment_failed',
        reservation_status: 'reservation_cancelled',
        tx_hash,
        block_number: blockNumber,
        explorer_url: explorerUrl,
        reason: 'The transferred amount is less than the reservation amount.',
      })
    }

    const confirmedAt = new Date().toISOString()
    const paymentId = await recordPayment(supabase, {
      reservationId: reservation.id,
      senderAddress: reservation.evm_address,
      recipientAddress,
      tokenContract: usdtContract,
      amountRaw: transfer.value.toString(),
      amountUsdt,
      txHash: tx_hash,
      status: 'payment_confirmed',
      blockNumber,
      confirmedAt,
    })
    await logEvent(supabase, paymentId, 'confirmed', {
      block_number: blockNumber,
      amount_raw: transfer.value.toString(),
    })

    await supabase
      .from('reservations')
      .update({ status: 'reservation_confirmed' })
      .eq('id', reservation.id)

    // Credit the internal ledger: host earning (net) + treasury fee.
    if (isValidEvmAddress(hostAddress)) {
      const hostAmountUsdt = String(reservation.host_amount_usdt ?? amountUsdt)
      const feeAmountUsdt = String(reservation.fee_amount_usdt ?? '0')
      await creditPayment(supabase, {
        hostAddress,
        treasuryAddress: recipientAddress,
        reservationId: reservation.id,
        paymentId,
        hostAmountUsdt,
        hostAmountRaw: decimalToRaw(hostAmountUsdt, USDT_DECIMALS),
        feeAmountUsdt,
        feeAmountRaw: decimalToRaw(feeAmountUsdt, USDT_DECIMALS),
      })
    }

    return json(request, {
      status: 'payment_confirmed',
      reservation_status: 'reservation_confirmed',
      tx_hash,
      block_number: blockNumber,
      explorer_url: explorerUrl,
    })
  } catch (error) {
    console.error('verify-usdt-payment failed', error)
    return errorResponse(
      request,
      error instanceof Error ? error.message : 'Unexpected error',
      500,
    )
  }
})
