import { createClient } from 'npm:@supabase/supabase-js@2'

import { readToken, verifyToken } from '../_shared/auth.ts'
import { errorResponse, json, preflight } from '../_shared/http.ts'
import { getPlatformConfig, splitRaw } from '../_shared/ledger.ts'
import {
  LUNA_PER_NIM,
  NIMIQ_MAINNET_ID,
  isValidNimiqAddress,
  lunaToNim,
  nimToLuna,
  normalizeNimiqAddress,
} from '../_shared/nimiq.ts'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_HOURS = 24
const SECONDS_PER_HOUR = 3600n

interface CreateReservationBody {
  parking_space_id?: string
  start_at?: string
  end_at?: string
  destination_name?: string | null
  destination_address?: string | null
  destination_lat?: number | string | null
  destination_lng?: number | string | null
}

Deno.serve(async (request) => {
  const options = preflight(request)
  if (options) return options
  if (request.method !== 'POST') {
    return errorResponse(request, 'Method not allowed', 405)
  }

  try {
    const body = (await request.json().catch(() => null)) as
      | CreateReservationBody
      | null
    if (!body) return errorResponse(request, 'Invalid JSON body.')

    const { parking_space_id, start_at, end_at } = body

    if (!parking_space_id || !UUID_RE.test(parking_space_id)) {
      return errorResponse(request, 'Invalid parking_space_id.')
    }

    // Authoritative identity comes from the signed session token — never the
    // request body, so a caller can only book for a wallet they control.
    const authAddress = await verifyToken(readToken(request, body))
    if (!authAddress) {
      return errorResponse(request, 'Sign in with your wallet to continue.', 401)
    }

    // The Nimiq account that signs in is the account that pays: the identity
    // comes from the signed token and is recorded on the reservation.

    const start = new Date(start_at ?? '')
    const end = new Date(end_at ?? '')
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return errorResponse(request, 'Invalid reservation time.')
    }
    if (end <= start) {
      return errorResponse(request, 'End time must be after start time.')
    }

    const durationSeconds = BigInt(
      Math.round((end.getTime() - start.getTime()) / 1000),
    )
    if (durationSeconds > BigInt(MAX_HOURS * 3600)) {
      return errorResponse(request, 'Reservation cannot exceed 24 hours.')
    }

    // Optional destination snapshot — the place the driver is actually going.
    // Stored only when explicitly supplied; never inferred or tracked.
    const destinationName =
      typeof body.destination_name === 'string' && body.destination_name.trim()
        ? body.destination_name.trim().slice(0, 200)
        : null
    const destinationAddress =
      typeof body.destination_address === 'string' &&
      body.destination_address.trim()
        ? body.destination_address.trim().slice(0, 300)
        : null
    const destinationLat = Number(body.destination_lat)
    const destinationLng = Number(body.destination_lng)
    const hasDestination =
      Boolean(destinationName) &&
      Number.isFinite(destinationLat) &&
      Number.isFinite(destinationLng) &&
      Math.abs(destinationLat) <= 90 &&
      Math.abs(destinationLng) <= 180

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: space, error: spaceError } = await supabase
      .from('parking_spaces')
      .select('id, price_nim, active')
      .eq('id', parking_space_id)
      .single()

    if (spaceError || !space) {
      return errorResponse(request, 'Parking space not found.', 404)
    }
    if (!space.active) {
      return errorResponse(request, 'This parking space is not available.', 409)
    }

    // Release abandoned unpaid reservations so their slots are bookable again.
    await supabase.rpc('expire_stale_reservations')

    const { data: conflicts, error: conflictError } = await supabase
      .from('reservations')
      .select('id')
      .eq('parking_space_id', parking_space_id)
      .in('status', ['reservation_pending', 'reservation_confirmed'])
      .lt('start_at', end.toISOString())
      .gt('end_at', start.toISOString())
      .limit(1)

    if (conflictError) throw conflictError
    if (conflicts && conflicts.length > 0) {
      return errorResponse(request, 'This time slot is no longer available.', 409)
    }

    const config = await getPlatformConfig(supabase)
    if (!isValidNimiqAddress(config.treasuryAddress)) {
      return errorResponse(request, 'Treasury address is not configured.', 500)
    }
    const treasury = normalizeNimiqAddress(config.treasuryAddress)

    // Price arrives from Postgres numeric as a string, so this stays exact —
    // no floating point anywhere near the amount.
    const hourlyLuna = nimToLuna(String(space.price_nim))
    const amountRaw = (hourlyLuna * durationSeconds) / SECONDS_PER_HOUR

    const amountNim = lunaToNim(amountRaw)

    // Platform fee split (integer math only).
    const { hostRaw, feeRaw } = splitRaw(amountRaw, config.feeBps)
    const hostAmountNim = lunaToNim(hostRaw)
    const feeAmountNim = lunaToNim(feeRaw)

    // A free listing (0 NIM) is confirmed immediately: there is nothing to pay,
    // so it never enters the pending payment window and needs no payment row.
    const isFree = amountRaw === 0n

    const { data: reservation, error: insertError } = await supabase
      .from('reservations')
      .insert({
        parking_space_id,
        nimiq_address: authAddress.toLowerCase(),
        start_at: start.toISOString(),
        end_at: end.toISOString(),
        amount_nim: amountNim,
        status: isFree ? 'reservation_confirmed' : 'reservation_pending',
        expires_at: isFree
          ? null
          : new Date(Date.now() + 15 * 60_000).toISOString(),
        recipient_address: treasury,
        host_amount_nim: hostAmountNim,
        fee_amount_nim: feeAmountNim,
        destination_name: hasDestination ? destinationName : null,
        destination_address: hasDestination ? destinationAddress : null,
        destination_lat: hasDestination ? destinationLat : null,
        destination_lng: hasDestination ? destinationLng : null,
      })
      .select(
        'id, amount_nim, start_at, end_at, status, expires_at, recipient_address, host_amount_nim, fee_amount_nim, destination_name, destination_address, destination_lat, destination_lng',
      )
      .single()

    if (insertError || !reservation) {
      // 23P01 = exclusion_violation (overlapping reservation)
      if (insertError?.code === '23P01') {
        return errorResponse(request, 'This time slot is no longer available.', 409)
      }
      throw insertError ?? new Error('Failed to create reservation')
    }

    return json(request, {
      reservation_id: reservation.id,
      amount_nim: Number(reservation.amount_nim),
      amount_luna: amountRaw.toString(),
      recipient_address: reservation.recipient_address,
      host_amount_nim: Number(reservation.host_amount_nim),
      fee_amount_nim: Number(reservation.fee_amount_nim),
      host_amount_luna: hostRaw.toString(),
      fee_amount_luna: feeRaw.toString(),
      // Nimiq is the native coin: no token contract, just a network id.
      network_id: Number(Deno.env.get('NIMIQ_NETWORK_ID') ?? NIMIQ_MAINNET_ID),
      luna_per_nim: Number(LUNA_PER_NIM),
      start_at: reservation.start_at,
      end_at: reservation.end_at,
      status: reservation.status,
      expires_at: reservation.expires_at,
      free: isFree,
      destination: hasDestination
        ? {
            name: destinationName,
            address: destinationAddress,
            lat: destinationLat,
            lng: destinationLng,
          }
        : null,
    })
  } catch (error) {
    console.error('create-reservation failed', error)
    return errorResponse(
      request,
      error instanceof Error ? error.message : 'Unexpected error',
      500,
    )
  }
})
