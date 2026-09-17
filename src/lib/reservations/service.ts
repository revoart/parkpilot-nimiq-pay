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
  nimiqAddress: string
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

interface RawReservation extends Omit<Reservation, 'amount_nim'> {
  amount_nim: number | string
  parking_spaces: Record<string, unknown> | Record<string, unknown>[]
}

interface RawPayment extends Omit<Payment, 'amount_nim'> {
  amount_nim: number | string
}

export async function createReservation(
  input: CreateReservationInput,
): Promise<CreateReservationResult> {
  const supabase = getSupabase()
  const authToken = await requireToken(input.nimiqAddress)
  const { data, error } = await supabase.functions.invoke('create-reservation', {
    body: {
      parking_space_id: input.parkingSpaceId,
      nimiq_address: input.nimiqAddress,
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
  nimiq_address: string
  start_at: string
  end_at: string
  amount_nim: number | string
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
    price_nim: 0,
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
  nimiqAddress: string,
): Promise<ReservationSummary[]> {
  const supabase = getSupabase()
  const authToken = await requireToken(nimiqAddress)
  const { data, error } = await supabase.functions.invoke('list-reservations', {
    body: { nimiq_address: nimiqAddress, auth_token: authToken },
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
        nimiq_address: row.nimiq_address,
        start_at: row.start_at,
        end_at: row.end_at,
        amount_nim: Number(row.amount_nim),
        // Not selected by the list query — only the payment screen needs it.
        recipient_address: null,
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
            amount_nim: Number((embeddedPayment as RawPayment).amount_nim ?? 0),
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
  nimiqAddress: string,
  reservationId: string,
): Promise<CancelReservationResult> {
  const supabase = getSupabase()
  const authToken = await requireToken(nimiqAddress)
  const { data, error } = await supabase.functions.invoke('cancel-reservation', {
    body: {
      nimiq_address: nimiqAddress,
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
  nimiqAddress: string,
): Promise<ReservationDetails> {
  const supabase = getSupabase()
  const authToken = await requireToken(nimiqAddress)
  const { data, error } = await supabase.functions.invoke('get-reservation', {
    body: {
      reservation_id: reservationId,
      nimiq_address: nimiqAddress,
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
    price_nim: Number(space.price_nim),
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
      amount_nim: Number(payload.reservation.amount_nim),
    },
    parkingSpace,
    payment: payload.payment
      ? { ...payload.payment, amount_nim: Number(payload.payment.amount_nim) }
      : null,
  }
}
