import { requireToken } from '@/lib/auth'
import { getSupabase } from '@/lib/supabase/client'
import { readFunctionError } from '@/lib/supabase/functions'
import type { ParkingSpace, PaymentStatus, ReservationStatus } from '@/types'
import { requireSupabase } from '@/utils/env'

export interface HostSpaceStats {
  bookings: number
  upcoming: number
  earned: number
}

export interface HostSpace extends ParkingSpace {
  stats: HostSpaceStats
}

export interface HostBooking {
  id: string
  parkingSpaceTitle: string
  parkingSpaceAddress: string
  parkingSpaceImageUrl: string | null
  startAt: string
  endAt: string
  amountNim: number
  status: ReservationStatus
  createdAt: string
  paymentStatus: PaymentStatus | null
  txHash: string | null
}

export interface HostEarnings {
  total: number
  today: number
  week: number
  month: number
  allTime: number
  series: { date: string; amount: number }[]
  currency: string
}

export interface CreateSpaceInput {
  evmAddress: string
  title: string
  address: string
  latitude: number
  longitude: number
  priceNim: number
  parkingType: string
  description?: string
  covered?: boolean
  evCharging?: boolean
  accessible?: boolean
  /** Required: exactly one photo, already uploaded to the host's prefix. */
  imageUrl: string
}

export interface UpdateSpaceInput {
  evmAddress: string
  id: string
  title?: string
  address?: string
  priceNim?: number
  parkingType?: string
  description?: string | null
  covered?: boolean
  evCharging?: boolean
  accessible?: boolean
  active?: boolean
  /** Replacement photo URL. Clearing it is refused while the listing is active. */
  imageUrl?: string | null
}

function normalizeSpace(row: Record<string, unknown>): ParkingSpace {
  return {
    id: String(row.id),
    title: String(row.title),
    description: (row.description as string | null) ?? null,
    address: String(row.address),
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    price_nim: Number(row.price_nim),
    payment_recipient_address: String(row.payment_recipient_address ?? ''),
    parking_type: (row.parking_type as string | null) ?? null,
    covered: Boolean(row.covered),
    ev_charging: Boolean(row.ev_charging),
    accessible: Boolean(row.accessible),
    active: Boolean(row.active),
    image_url: (row.image_url as string | null) ?? null,
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
  }
}

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024

/**
 * Uploads the listing's single photo through the Edge Function (the anon client
 * has no storage write access). Pass `parkingSpaceId` when replacing an existing
 * listing's photo; omit it for the pre-publish upload.
 */
export async function uploadParkingPhoto(
  evmAddress: string,
  file: File,
  parkingSpaceId?: string,
): Promise<string> {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type.toLowerCase())) {
    throw new Error('Use a JPEG, PNG or WebP image.')
  }
  if (file.size > MAX_PHOTO_BYTES) {
    throw new Error('Image must be 5 MB or smaller.')
  }

  const { url, anonKey } = requireSupabase()
  const authToken = await requireToken(evmAddress)

  const form = new FormData()
  form.append('file', file)
  form.set('auth_token', authToken)
  if (parkingSpaceId) form.set('parking_space_id', parkingSpaceId)

  // Direct fetch so the browser sets the multipart boundary itself.
  const response = await fetch(`${url}/functions/v1/upload-parking-photo`, {
    method: 'POST',
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    body: form,
  })

  const payload = (await response.json().catch(() => null)) as
    | { image_url?: string; error?: string }
    | null

  if (!response.ok || !payload?.image_url) {
    throw new Error(payload?.error ?? 'Could not upload the photo.')
  }

  return payload.image_url
}

export async function listHostSpaces(evmAddress: string): Promise<HostSpace[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase.functions.invoke('list-host-spaces', {
    body: { evm_address: evmAddress },
  })

  if (error) {
    throw new Error(await readFunctionError(error, 'Could not load your spaces.'))
  }

  const payload = data as { spaces?: Record<string, unknown>[]; error?: string } | null
  if (!payload || payload.error) {
    throw new Error(payload?.error ?? 'Could not load your spaces.')
  }

  return (payload.spaces ?? []).map((row) => {
    const stats = (row.stats as Record<string, unknown> | undefined) ?? {}
    return {
      ...normalizeSpace(row),
      stats: {
        bookings: Number(stats.bookings ?? 0),
        upcoming: Number(stats.upcoming ?? 0),
        earned: Number(stats.earned ?? 0),
      },
    }
  })
}

export async function listHostBookings(evmAddress: string): Promise<HostBooking[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase.functions.invoke('list-host-bookings', {
    body: { evm_address: evmAddress },
  })

  if (error) {
    throw new Error(
      await readFunctionError(error, 'Could not load host bookings.'),
    )
  }

  const payload = data as { bookings?: Record<string, unknown>[]; error?: string } | null
  if (!payload || payload.error) {
    throw new Error(payload?.error ?? 'Could not load host bookings.')
  }

  return (payload.bookings ?? []).map((row) => {
    const space = (Array.isArray(row.parking_spaces)
      ? row.parking_spaces[0]
      : row.parking_spaces) as Record<string, unknown> | undefined
    const payment = (Array.isArray(row.payments)
      ? row.payments[0]
      : row.payments) as Record<string, unknown> | undefined

    return {
      id: String(row.id),
      parkingSpaceTitle: String(space?.title ?? 'Parking space'),
      parkingSpaceAddress: String(space?.address ?? ''),
      parkingSpaceImageUrl: (space?.image_url as string | null) ?? null,
      startAt: String(row.start_at),
      endAt: String(row.end_at),
      amountNim: Number(row.amount_nim),
      status: row.status as ReservationStatus,
      createdAt: String(row.created_at ?? ''),
      paymentStatus: (payment?.status as PaymentStatus) ?? null,
      txHash: (payment?.tx_hash as string) ?? null,
    }
  })
}

export async function getHostEarnings(evmAddress: string): Promise<HostEarnings> {
  const supabase = getSupabase()
  const authToken = await requireToken(evmAddress)
  const { data, error } = await supabase.functions.invoke('host-earnings', {
    body: { evm_address: evmAddress, auth_token: authToken },
  })

  if (error) {
    throw new Error(
      await readFunctionError(error, 'Could not load your earnings.'),
    )
  }

  const payload = data as (HostEarnings & { error?: string }) | null
  if (!payload || payload.error) {
    throw new Error(payload?.error ?? 'Could not load your earnings.')
  }

  return {
    total: Number(payload.total ?? 0),
    today: Number(payload.today ?? 0),
    week: Number(payload.week ?? 0),
    month: Number(payload.month ?? 0),
    allTime: Number(payload.allTime ?? 0),
    series: payload.series ?? [],
    currency: payload.currency ?? 'NIM',
  }
}

export interface HostPayout {
  id: string
  amount_nim: number
  status: 'requested' | 'processing' | 'paid' | 'failed'
  tx_hash: string | null
  block_number: number | null
  requested_at: string
  completed_at: string | null
  payout_address: string
}

export interface HostWallet {
  available: number
  pending: number
  totalEarned: number
  totalWithdrawn: number
  payout_address: string | null
  min_payout_nim: number
  fee_bps: number
  payouts: HostPayout[]
}

export async function getHostWallet(evmAddress: string): Promise<HostWallet> {
  const supabase = getSupabase()
  const authToken = await requireToken(evmAddress)
  const { data, error } = await supabase.functions.invoke('get-host-wallet', {
    body: { auth_token: authToken },
  })

  if (error) {
    throw new Error(
      await readFunctionError(error, 'Could not load your wallet.'),
    )
  }

  const payload = data as (HostWallet & { error?: string }) | null
  if (!payload || payload.error) {
    throw new Error(payload?.error ?? 'Could not load your wallet.')
  }

  return {
    available: Number(payload.available ?? 0),
    pending: Number(payload.pending ?? 0),
    totalEarned: Number(payload.totalEarned ?? 0),
    totalWithdrawn: Number(payload.totalWithdrawn ?? 0),
    payout_address: payload.payout_address ?? null,
    min_payout_nim: Number(payload.min_payout_nim ?? 1),
    fee_bps: Number(payload.fee_bps ?? 0),
    payouts: (payload.payouts ?? []).map((payout) => ({
      ...payout,
      amount_nim: Number(payout.amount_nim ?? 0),
    })),
  }
}

export async function requestPayout(
  evmAddress: string,
  amountNim: number,
  payoutAddress: string,
): Promise<void> {
  const supabase = getSupabase()
  const authToken = await requireToken(evmAddress)
  const { data, error } = await supabase.functions.invoke('request-payout', {
    body: {
      amount_nim: amountNim,
      payout_address: payoutAddress,
      auth_token: authToken,
    },
  })

  if (error) {
    throw new Error(
      await readFunctionError(error, 'Could not request a payout.'),
    )
  }

  const payload = data as { payout?: unknown; error?: string } | null
  if (!payload || payload.error || !payload.payout) {
    throw new Error(payload?.error ?? 'Could not request a payout.')
  }
}

export async function createParkingSpace(
  input: CreateSpaceInput,
): Promise<ParkingSpace> {
  const supabase = getSupabase()
  const authToken = await requireToken(input.evmAddress)
  const { data, error } = await supabase.functions.invoke(
    'create-parking-space',
    {
      body: {
        evm_address: input.evmAddress,
        auth_token: authToken,
        title: input.title,
        address: input.address,
        latitude: input.latitude,
        longitude: input.longitude,
        price_nim: input.priceNim,
        parking_type: input.parkingType,
        description: input.description ?? null,
        covered: input.covered ?? false,
        ev_charging: input.evCharging ?? false,
        accessible: input.accessible ?? false,
        image_url: input.imageUrl,
      },
    },
  )

  if (error) {
    throw new Error(await readFunctionError(error, 'Could not create the space.'))
  }

  const payload = data as { parking_space?: Record<string, unknown>; error?: string } | null
  if (!payload || payload.error || !payload.parking_space) {
    throw new Error(payload?.error ?? 'Could not create the space.')
  }

  return normalizeSpace(payload.parking_space)
}

export async function updateParkingSpace(
  input: UpdateSpaceInput,
): Promise<ParkingSpace> {
  const supabase = getSupabase()
  const authToken = await requireToken(input.evmAddress)
  const body: Record<string, unknown> = {
    evm_address: input.evmAddress,
    id: input.id,
    auth_token: authToken,
  }
  if (input.title !== undefined) body.title = input.title
  if (input.address !== undefined) body.address = input.address
  if (input.priceNim !== undefined) body.price_nim = input.priceNim
  if (input.parkingType !== undefined) body.parking_type = input.parkingType
  if (input.description !== undefined) body.description = input.description
  if (input.covered !== undefined) body.covered = input.covered
  if (input.evCharging !== undefined) body.ev_charging = input.evCharging
  if (input.accessible !== undefined) body.accessible = input.accessible
  if (input.active !== undefined) body.active = input.active
  if (input.imageUrl !== undefined) body.image_url = input.imageUrl

  const { data, error } = await supabase.functions.invoke(
    'update-parking-space',
    { body },
  )

  if (error) {
    throw new Error(await readFunctionError(error, 'Could not save the listing.'))
  }

  const payload = data as { parking_space?: Record<string, unknown>; error?: string } | null
  if (!payload || payload.error || !payload.parking_space) {
    throw new Error(payload?.error ?? 'Could not save the listing.')
  }

  return normalizeSpace(payload.parking_space)
}

export interface AvailabilityRuleInput {
  weekday: number
  start_time: string
  end_time: string
  active: boolean
}

export async function setAvailability(
  evmAddress: string,
  parkingSpaceId: string,
  rules: AvailabilityRuleInput[],
): Promise<void> {
  const supabase = getSupabase()
  const authToken = await requireToken(evmAddress)
  const { data, error } = await supabase.functions.invoke('set-availability', {
    body: {
      evm_address: evmAddress,
      parking_space_id: parkingSpaceId,
      rules,
      auth_token: authToken,
    },
  })

  if (error) {
    throw new Error(
      await readFunctionError(error, 'Could not save availability.'),
    )
  }

  const payload = data as { ok?: boolean; error?: string } | null
  if (!payload || payload.error || !payload.ok) {
    throw new Error(payload?.error ?? 'Could not save availability.')
  }
}

export async function deleteParkingSpace(
  evmAddress: string,
  id: string,
): Promise<void> {
  const supabase = getSupabase()
  const authToken = await requireToken(evmAddress)
  const { data, error } = await supabase.functions.invoke(
    'delete-parking-space',
    { body: { evm_address: evmAddress, id, auth_token: authToken } },
  )

  if (error) {
    throw new Error(
      await readFunctionError(error, 'Could not delete the listing.'),
    )
  }

  const payload = data as { deleted?: boolean; error?: string } | null
  if (!payload || payload.error || !payload.deleted) {
    throw new Error(payload?.error ?? 'Could not delete the listing.')
  }
}
