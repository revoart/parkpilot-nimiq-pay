import { createClient } from 'npm:@supabase/supabase-js@2'

import { readToken, verifyToken } from '../_shared/auth.ts'
import { errorResponse, json, preflight } from '../_shared/http.ts'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface GetReservationBody {
  reservation_id?: string
  nimiq_address?: string
}

/**
 * Returns a reservation together with its parking space and latest payment.
 * The caller must supply the wallet address that owns the reservation, which
 * prevents enumerating other users' reservations by UUID.
 */
Deno.serve(async (request) => {
  const options = preflight(request)
  if (options) return options
  if (request.method !== 'POST') {
    return errorResponse(request, 'Method not allowed', 405)
  }

  try {
    const body = (await request.json().catch(() => null)) as
      | GetReservationBody
      | null
    if (!body) return errorResponse(request, 'Invalid JSON body.')

    const { reservation_id } = body
    if (!reservation_id || !UUID_RE.test(reservation_id)) {
      return errorResponse(request, 'Invalid reservation_id.')
    }
    // Only the wallet that owns the reservation may read it.
    const nimiq_address = await verifyToken(readToken(request, body))
    if (!nimiq_address) {
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

    const { data: reservation, error } = await supabase
      .from('reservations')
      .select(
        'id, parking_space_id, nimiq_address, start_at, end_at, amount_nim, status, created_at, updated_at, recipient_address, host_amount_nim, fee_amount_nim, destination_name, destination_address, destination_lat, destination_lng, parking_spaces ( id, title, address, latitude, longitude, price_nim, payment_recipient_address, parking_type, covered, ev_charging, accessible, image_url )',
      )
      .eq('id', reservation_id)
      .single()

    if (error || !reservation) {
      return errorResponse(request, 'Reservation not found.', 404)
    }

    if (
      reservation.nimiq_address.toLowerCase() !== nimiq_address.toLowerCase()
    ) {
      return errorResponse(request, 'Reservation not found.', 404)
    }

    const { data: payment } = await supabase
      .from('payments')
      .select(
        'id, status, tx_hash, block_number, confirmed_at, amount_nim, sender_address, recipient_address, token_contract',
      )
      .eq('reservation_id', reservation_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    return json(request, {
      reservation,
      payment: payment ?? null,
    })
  } catch (error) {
    console.error('get-reservation failed', error)
    return errorResponse(
      request,
      error instanceof Error ? error.message : 'Unexpected error',
      500,
    )
  }
})
