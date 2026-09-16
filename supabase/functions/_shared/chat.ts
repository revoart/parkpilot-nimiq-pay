import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

/**
 * Thread membership and phone disclosure.
 *
 * Every chat endpoint routes through `loadThread`, so the authorization rule
 * lives in exactly one place: you are a participant if you are the
 * reservation's driver, or the owner of the parking space it booked. Duplicating
 * that check per function is how one of them eventually drifts.
 */

export interface Thread {
  reservationId: string
  /** The reservation's driver. */
  driverAddress: string
  /** The owner of the reserved parking space. */
  hostAddress: string
  /** The caller's role in this thread. */
  isDriver: boolean
  /** The other participant's wallet. */
  counterpartyAddress: string
  spaceTitle: string
  spaceImageUrl: string | null
  status: string
  startAt: string
  endAt: string
}

interface ReservationRow {
  id: string
  evm_address: string | null
  status: string
  start_at: string
  end_at: string
  parking_spaces:
    | { title: string | null; owner_evm_address: string | null; image_url: string | null }
    | { title: string | null; owner_evm_address: string | null; image_url: string | null }[]
    | null
}

function one<T>(value: T | T[] | null): T | null {
  if (!value) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

/**
 * Load a reservation and confirm the caller belongs to its thread.
 *
 * Returns null when the reservation does not exist OR the caller is not a
 * participant — deliberately the same answer for both, so the endpoint cannot
 * be used to probe which reservation ids exist.
 */
export async function loadThread(
  supabase: SupabaseClient,
  reservationId: string,
  owner: string,
): Promise<Thread | null> {
  if (!reservationId) return null

  const { data, error } = await supabase
    .from('reservations')
    .select(
      'id, evm_address, status, start_at, end_at, parking_spaces ( title, owner_evm_address, image_url )',
    )
    .eq('id', reservationId)
    .maybeSingle()

  if (error || !data) return null

  const row = data as unknown as ReservationRow
  const space = one(row.parking_spaces)
  const driverAddress = (row.evm_address ?? '').toLowerCase()
  const hostAddress = (space?.owner_evm_address ?? '').toLowerCase()

  const isDriver = driverAddress === owner
  const isHost = hostAddress === owner
  if (!isDriver && !isHost) return null

  return {
    reservationId: row.id,
    driverAddress,
    hostAddress,
    isDriver,
    counterpartyAddress: isDriver ? hostAddress : driverAddress,
    spaceTitle: space?.title ?? 'Parking space',
    spaceImageUrl: space?.image_url ?? null,
    status: row.status,
    startAt: row.start_at,
    endAt: row.end_at,
  }
}

/**
 * Whether a booking is live enough to justify revealing a phone number.
 *
 * Pending or confirmed and not yet finished. After that the number is withheld
 * again, so a completed booking cannot become a permanent directory entry.
 */
export function bookingIsActive(thread: Thread, now = Date.now()): boolean {
  const live =
    thread.status === 'reservation_pending' ||
    thread.status === 'reservation_confirmed'
  if (!live) return false
  const end = Date.parse(thread.endAt)
  return Number.isFinite(end) ? end > now : false
}

/** A counterparty's profile row, as stored. */
export interface ContactRow {
  display_name: string | null
  avatar_url: string | null
  phone: string | null
  phone_shared: boolean
}

/** A counterparty's profile with the phone already filtered for this booking. */
export interface Contact {
  display_name: string | null
  avatar_url: string | null
  /** Present only when the owner opted in AND the booking is active. */
  phone: string | null
}

/**
 * Load profile rows for many wallets in one round trip.
 *
 * `ilike` per address rather than `in`, because stored wallets are not
 * guaranteed to be lowercase and `in` is case-sensitive. Wallet addresses
 * contain no LIKE wildcards, so this is an exact case-insensitive match.
 */
export async function loadContacts(
  supabase: SupabaseClient,
  addresses: string[],
): Promise<Map<string, ContactRow>> {
  const unique = [
    ...new Set(addresses.map((address) => address.toLowerCase()).filter(Boolean)),
  ]
  const found = new Map<string, ContactRow>()
  if (!unique.length) return found

  const { data } = await supabase
    .from('profiles')
    .select('evm_address, display_name, avatar_url, phone, phone_shared')
    .or(unique.map((address) => `evm_address.ilike.${address}`).join(','))

  for (const row of (data ?? []) as (ContactRow & { evm_address: string | null })[]) {
    const key = (row.evm_address ?? '').toLowerCase()
    if (!key) continue
    found.set(key, {
      display_name: row.display_name ?? null,
      avatar_url: row.avatar_url ?? null,
      phone: row.phone ?? null,
      phone_shared: Boolean(row.phone_shared),
    })
  }

  return found
}

/**
 * A counterparty's contact card for a specific thread.
 *
 * The phone number is released only when its owner has opted in *and* the
 * booking is still active. Chat remains available either way, so declining to
 * share a number never blocks communication.
 */
export function contactFor(
  contacts: Map<string, ContactRow>,
  thread: Thread,
): Contact {
  const row = contacts.get(thread.counterpartyAddress.toLowerCase())
  const mayReveal = Boolean(row?.phone_shared) && bookingIsActive(thread)

  return {
    display_name: row?.display_name ?? null,
    avatar_url: row?.avatar_url ?? null,
    phone: mayReveal ? (row?.phone ?? null) : null,
  }
}
