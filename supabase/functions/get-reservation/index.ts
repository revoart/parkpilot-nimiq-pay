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

    const RESERVATION_COLUMNS =
      'id, parking_space_id, nimiq_address, start_at, end_at, amount_nim, status, created_at, updated_at, recipient_address, host_amount_nim, fee_amount_nim, destination_name, destination_address, destination_lat, destination_lng, parking_spaces ( id, title, address, latitude, longitude, price_nim, parking_type, covered, ev_charging, accessible, image_url )'

    const { data: byId } = await supabase
      .from('reservations')
      .select(RESERVATION_COLUMNS)
      .eq('id', reservation_id)
      .ilike('nimiq_address', nimiq_address)
      .maybeSingle()

    // The navigation screen reaches the pass from a parking-space context and
    // only knows the space id, so `/pass/<space-id>` used to fail with
    // "Reservation not found" the moment a driver arrived and tapped through.
    // Rather than plumb the reservation id through every route, the same lookup
    // is retried against the space and the caller's own booking is resolved.
    // Both ids are uuids, so the first lookup simply finds nothing.
    const { data: bySpace } = byId
      ? { data: null }
      : await supabase
          .from('reservations')
          .select(RESERVATION_COLUMNS)
          .eq('parking_space_id', reservation_id)
          .ilike('nimiq_address', nimiq_address)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

    const reservation = byId ?? bySpace

    if (!reservation) {
      return errorResponse(request, 'Reservation not found.', 404)
    }

    const reservationId = reservation.id

    const { data: payment } = await supabase
      .from('payments')
      .select(
        'id, status, tx_hash, block_number, confirmed_at, amount_nim, sender_address, recipient_address, token_contract',
      )
      .eq('reservation_id', reservationId)
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
