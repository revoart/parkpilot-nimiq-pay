export type ReservationStatus =
  | 'reservation_pending'
  | 'reservation_confirmed'
  | 'reservation_cancelled'
  | 'reservation_completed'
  | 'reservation_expired'

export type PaymentStatus =
  | 'payment_pending'
  | 'payment_submitted'
  | 'payment_verifying'
  | 'payment_confirmed'
  | 'payment_failed'
  | 'payment_expired'

export interface ParkingSpace {
  id: string
  title: string
  description: string | null
  address: string
  latitude: number
  longitude: number
  price_usdt: number
  payment_recipient_address: string
  parking_type: string | null
  covered: boolean
  ev_charging: boolean
  accessible: boolean
  active: boolean
  /** Exactly one photo per listing. Null only for legacy/unseeded rows. */
  image_url: string | null
  created_at: string
  updated_at: string
}

/**
 * A listing returned by the radius search, carrying the distance the database
 * actually measured and its real current state. Never constructed in the UI.
 */
export interface NearbyParkingSpace extends ParkingSpace {
  /** Great-circle distance from the search centre, in metres. */
  distance_m: number
  /**
   * Latest end of a reservation covering right now, or null when the space is
   * free this moment. Derived from the same rule the reservation overlap
   * constraint uses.
   */
  busy_until: string | null
  /** Mean review score, or null when the listing has no reviews yet. */
  rating_avg: number | null
  /** How many reviews `rating_avg` is based on. Zero when there are none. */
  rating_count: number
}

export interface ParkingSpacePhoto {
  id: string
  parking_space_id: string
  storage_path: string
  sort_order: number
}

export interface ParkingAvailability {
  id: string
  parking_space_id: string
  date: string
  start_time: string
  end_time: string
  available: boolean
  created_at: string
}

export interface Reservation {
  id: string
  parking_space_id: string
  user_id: string | null
  evm_address: string
  nmiq_address: string | null
  start_at: string
  end_at: string
  amount_usdt: number
  status: ReservationStatus
  created_at: string
  updated_at: string
  /** Snapshot of where the driver is actually going (parking is not the end). */
  destination_name: string | null
  destination_address: string | null
  destination_lat: number | null
  destination_lng: number | null
}

/** The place the driver wants to end up at — distinct from the parking space. */
export interface Destination {
  name: string
  address?: string | null
  lat: number
  lng: number
}

/**
 * A destination the driver can pick.
 *
 * `id` must be stable for the same real-world place, otherwise saved and recent
 * destinations duplicate every time the place is searched again.
 */
export interface Place {
  id: string
  name: string
  address: string
  lat: number
  lng: number
  /** Geocoder reference (e.g. `node:123456`), when one was supplied. */
  placeId?: string | null
}

export interface Payment {
  id: string
  reservation_id: string
  chain: string
  token: string
  token_contract: string
  sender_address: string
  recipient_address: string
  amount_raw: string
  amount_usdt: number
  tx_hash: string
  status: PaymentStatus
  submitted_at: string | null
  confirmed_at: string | null
  block_number: number | null
  created_at: string
}

export interface WalletIdentity {
  id: string
  evm_address: string | null
  nmiq_address: string | null
  public_key: string | null
  signature: string | null
  challenge: string | null
  verified_at: string | null
  created_at: string
}

export interface Review {
  id: string
  parking_space_id: string
  evm_address: string | null
  rating: number
  comment: string | null
  created_at: string
}

export interface AppEvent {
  id: string
  event_name: string
  anonymous_device_id: string | null
  evm_address: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

/** Data returned by the create-reservation edge function. */
export interface CreateReservationResult {
  reservation_id: string
  amount_usdt: number
  amount_raw: string
  recipient_address: string
  token_contract: string
  chain_id: number
  /** A $0.00 listing is confirmed immediately and skips the payment screen. */
  free?: boolean
  status?: ReservationStatus
  destination?: Destination | null
}

export interface VerifyPaymentResult {
  status: PaymentStatus
  reservation_status: ReservationStatus
  tx_hash: string
  block_number: number | null
  explorer_url: string
  reason?: string
}

/* ── Driver ↔ host chat ──────────────────────────────────────────────────────
 * A thread belongs to a reservation, so both parties always have a booking in
 * common. Everything here is produced by the chat Edge Functions.
 */

export interface ChatMessage {
  id: string
  body: string
  created_at: string
  /** True when the signed-in wallet sent it. */
  is_mine: boolean
}

/** The other participant. `phone` is null unless they opted in and the booking is live. */
export interface ChatContact {
  display_name: string | null
  avatar_url: string | null
  phone: string | null
}

export interface ChatThread {
  reservation_id: string
  is_driver: boolean
  role: 'driver' | 'host'
  space_title: string
  space_image_url: string | null
  status: ReservationStatus
  start_at: string
  end_at: string
}

export interface ConversationSummary {
  reservation_id: string
  is_driver: boolean
  role: 'driver' | 'host'
  space_title: string
  space_image_url: string | null
  status: ReservationStatus
  start_at: string
  end_at: string
  last_message_at: string | null
  last_message_body: string | null
  /** Null when the thread has no messages yet. */
  last_message_is_mine: boolean | null
  unread_count: number
  /** Shown when the counterparty has not set a display name. */
  counterparty_address: string
  contact: ChatContact
}

export interface ChatThreadResult {
  messages: ChatMessage[]
  /** Send this back as `since` on the next poll; it is the database's own value. */
  next_cursor: string | null
  thread: ChatThread
  contact: ChatContact
}
