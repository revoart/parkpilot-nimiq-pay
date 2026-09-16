import { createClient } from 'npm:@supabase/supabase-js@2'

import { readToken, verifyToken } from '../_shared/auth.ts'
import { errorResponse, json, preflight } from '../_shared/http.ts'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CANCEL_WINDOW_MS = 60 * 60_000

interface Body {
  evm_address?: string
  reservation_id?: string
}

/**
 * Driver-initiated cancellation.
 * Cancelling releases the slot automatically (the overlap exclusion constraint
 * only covers pending/confirmed rows). Paid reservations are flagged so the
 * host can refund — the NIM has already left the driver's account, so the
 * platform cannot reverse it.
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
    if (!body.reservation_id || !UUID_RE.test(body.reservation_id)) {
      return errorResponse(request, 'Invalid reservation id.')
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Authoritative identity comes from the signed session token.
    const owner = await verifyToken(readToken(request, body))
    if (!owner) {
      return errorResponse(
        request,
        'Sign in with your wallet to continue.',
        401,
      )
    }

    const { data: reservation, error } = await supabase
      .from('reservations')
      .select('id, evm_address, status, start_at, amount_nim')
      .eq('id', body.reservation_id)
      .single()

    if (error || !reservation) {
      return errorResponse(request, 'Reservation not found.', 404)
    }
    // Ownership check (case-insensitive) — never reveal other users' rows.
    if (reservation.evm_address.toLowerCase() !== owner) {
      return errorResponse(request, 'Reservation not found.', 404)
    }

    if (reservation.status === 'reservation_cancelled') {
      return json(request, { status: 'reservation_cancelled', refund_owed: false })
    }
    if (reservation.status === 'reservation_expired') {
      return errorResponse(request, 'This reservation has already expired.', 409)
    }
    if (reservation.status === 'reservation_completed') {
      return errorResponse(request, 'This reservation is already completed.', 409)
    }

    const startMs = new Date(reservation.start_at).getTime()
    if (Date.now() > startMs - CANCEL_WINDOW_MS) {
      return errorResponse(
        request,
        'Reservations can only be cancelled more than 1 hour before the start time.',
        409,
      )
    }

    const { data: payment } = await supabase
      .from('payments')
      .select('id')
      .eq('reservation_id', reservation.id)
      .eq('status', 'payment_confirmed')
      .maybeSingle()

    const refundOwed = Boolean(payment)

    const { error: updateError } = await supabase
      .from('reservations')
      .update({ status: 'reservation_cancelled' })
      .eq('id', reservation.id)

    if (updateError) throw updateError

    if (payment) {
      await supabase.from('payment_events').insert({
        payment_id: payment.id,
        event_type: 'cancelled_refund_owed',
        payload: {
          reservation_id: reservation.id,
          amount_nim: reservation.amount_nim,
        },
      })
    }

    return json(request, {
      status: 'reservation_cancelled',
      refund_owed: refundOwed,
    })
  } catch (error) {
    console.error('cancel-reservation failed', error)
    return errorResponse(
      request,
      error instanceof Error ? error.message : 'Unexpected error',
      500,
    )
  }
})
