import { requireToken } from '@/lib/auth'
import { getSupabase } from '@/lib/supabase/client'
import { readFunctionError } from '@/lib/supabase/functions'
import type {
  CreateReservationResult,
  Destination,
  ParkingSpace,
  Payment,
  Reservation,
  ReservationStatus,
} from '@/types'

export interface CreateReservationInput {
  parkingSpaceId: string
  evmAddress: string
  nmiqAddress?: string | null
  startAt: string
  endAt: string
  /** The place the driver is heading to — persisted with the reservation. */
  destination?: Destination | null
}

export interface ReservationDetails {
  reservation: Reservation
  parkingSpace: ParkingSpace
  payment: Payment | null
}

interface RawReservation extends Omit<Reservation, 'amount_usdt'> {
  amount_usdt: number | string
  parking_spaces: Record<string, unknown> | Record<string, unknown>[]
}

interface RawPayment extends Omit<Payment, 'amount_usdt'> {
  amount_usdt: number | string
}

export async function createReservation(
  input: CreateReservationInput,
): Promise<CreateReservationResult> {
  const supabase = getSupabase()
  const authToken = await requireToken(input.evmAddress)
  const { data, error } = await supabase.functions.invoke('create-reservation', {
    body: {
      parking_space_id: input.parkingSpaceId,
      evm_address: input.evmAddress,
      nmiq_address: input.nmiqAddress ?? null,
      start_at: input.startAt,
      end_at: input.endAt,
      destination_name: input.destination?.name ?? null,
      destination_address: input.destination?.address ?? null,
      destination_lat: input.destination?.lat ?? null,
      destination_lng: input.destination?.lng ?? null,
      auth_token: authToken,
    },
  })

  if (error) {
    throw new Error(
      await readFunctionError(error, 'Could not create the reservation.'),
    )
  }

  const result = data as (CreateReservationResult & { error?: string }) | null
  if (!result || result.error) {
    throw new Error(result?.error ?? 'Could not create the reservation.')
  }

  return result
}

export interface ReservationSummary {
  reservation: Reservation
  parkingSpace: ParkingSpace
  payment: Payment | null
}

interface RawSummary {
  id: string
  parking_space_id: string
  evm_address: string
  nmiq_address: string | null
  start_at: string
  end_at: string
  amount_usdt: number | string
  status: Reservation['status']
  created_at: string
  updated_at: string
  destination_name: string | null
  destination_address: string | null
  destination_lat: number | null
  destination_lng: number | null
  parking_spaces: Record<string, unknown> | Record<string, unknown>[]
  payments: RawPayment | RawPayment[] | null
}

function toParkingSpace(space: Record<string, unknown>): ParkingSpace {
  return {
    id: String(space.id),
    title: String(space.title),
    description: null,
    address: String(space.address),
    latitude: Number(space.latitude),
    longitude: Number(space.longitude),
    price_usdt: 0,
    payment_recipient_address: '',
    parking_type: (space.parking_type as string | null) ?? null,
    covered: Boolean(space.covered),
    ev_charging: Boolean(space.ev_charging),
    accessible: Boolean(space.accessible),
    active: true,
    image_url: (space.image_url as string | null) ?? null,
    created_at: '',
    updated_at: '',
  }
}

export async function listReservations(
  evmAddress: string,
): Promise<ReservationSummary[]> {
  const supabase = getSupabase()
  const authToken = await requireToken(evmAddress)
  const { data, error } = await supabase.functions.invoke('list-reservations', {
    body: { evm_address: evmAddress, auth_token: authToken },
  })

  if (error) {
    throw new Error(
      await readFunctionError(error, 'Could not load your reservations.'),
    )
  }

  const payload = data as { reservations?: RawSummary[]; error?: string } | null
  if (!payload || payload.error) {
    throw new Error(payload?.error ?? 'Could not load your reservations.')
  }

  return (payload.reservations ?? []).map((row) => {
    const embeddedSpace = Array.isArray(row.parking_spaces)
      ? row.parking_spaces[0]
      : row.parking_spaces
    const embeddedPayment = Array.isArray(row.payments)
      ? row.payments[0]
      : row.payments

    return {
      reservation: {
        id: row.id,
        parking_space_id: row.parking_space_id,
        user_id: null,
        evm_address: row.evm_address,
        nmiq_address: row.nmiq_address,
        start_at: row.start_at,
        end_at: row.end_at,
        amount_usdt: Number(row.amount_usdt),
        status: row.status,
        created_at: row.created_at,
        updated_at: row.updated_at,
        destination_name: row.destination_name ?? null,
        destination_address: row.destination_address ?? null,
        destination_lat: row.destination_lat ?? null,
        destination_lng: row.destination_lng ?? null,
      },
      parkingSpace: toParkingSpace(embeddedSpace as Record<string, unknown>),
      payment: embeddedPayment
        ? {
            ...(embeddedPayment as RawPayment),
            amount_usdt: Number((embeddedPayment as RawPayment).amount_usdt ?? 0),
          }
        : null,
    }
  })
}

export interface CancelReservationResult {
  status: ReservationStatus
  refund_owed: boolean
}

/** Driver-initiated cancellation (server-validated, ownership-checked). */
export async function cancelReservation(
  evmAddress: string,
  reservationId: string,
): Promise<CancelReservationResult> {
  const supabase = getSupabase()
  const authToken = await requireToken(evmAddress)
  const { data, error } = await supabase.functions.invoke('cancel-reservation', {
    body: {
      evm_address: evmAddress,
      reservation_id: reservationId,
      auth_token: authToken,
    },
  })

  if (error) {
    throw new Error(
      await readFunctionError(error, 'Could not cancel the reservation.'),
    )
  }

  const payload = data as (CancelReservationResult & { error?: string }) | null
  if (!payload || payload.error) {
    throw new Error(payload?.error ?? 'Could not cancel the reservation.')
  }

  return payload
}

export async function getReservation(
  reservationId: string,
  evmAddress: string,
): Promise<ReservationDetails> {
  const supabase = getSupabase()
  const authToken = await requireToken(evmAddress)
  const { data, error } = await supabase.functions.invoke('get-reservation', {
    body: {
      reservation_id: reservationId,
      evm_address: evmAddress,
      auth_token: authToken,
    },
  })

  if (error) {
    throw new Error(
      await readFunctionError(error, 'Could not load the reservation.'),
    )
  }

  const payload = data as
    | { reservation: RawReservation; payment: RawPayment | null; error?: string }
    | null

  if (!payload || payload.error || !payload.reservation) {
    throw new Error(payload?.error ?? 'Could not load the reservation.')
  }

  const embedded = payload.reservation.parking_spaces
  const space = (Array.isArray(embedded) ? embedded[0] : embedded) as Record<
    string,
    unknown
  >

  const parkingSpace: ParkingSpace = {
    id: String(space.id),
    title: String(space.title),
    description: null,
    address: String(space.address),
    latitude: Number(space.latitude),
    longitude: Number(space.longitude),
    price_usdt: Number(space.price_usdt),
    payment_recipient_address: String(space.payment_recipient_address ?? ''),
    parking_type: (space.parking_type as string | null) ?? null,
    covered: Boolean(space.covered),
    ev_charging: Boolean(space.ev_charging),
    accessible: Boolean(space.accessible),
    active: true,
    image_url: (space.image_url as string | null) ?? null,
    created_at: '',
    updated_at: '',
  }

  return {
    reservation: {
      ...payload.reservation,
      amount_usdt: Number(payload.reservation.amount_usdt),
    },
    parkingSpace,
    payment: payload.payment
      ? { ...payload.payment, amount_usdt: Number(payload.payment.amount_usdt) }
      : null,
  }
}
