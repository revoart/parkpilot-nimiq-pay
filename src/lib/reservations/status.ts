import type { ReservationStatus } from '@/types'
import type { PillTone } from '@/components/ui/StatusPill'

/**
 * Single source of truth for how a reservation is presented.
 * Derived from the stored status + the reservation window.
 */
export type ReservationPhase =
  | 'pending'
  | 'confirmed'
  | 'active'
  | 'expiring'
  | 'completed'
  | 'cancelled'
  | 'expired'

export const PHASE_LABEL: Record<ReservationPhase, string> = {
  pending: 'Pending payment',
  confirmed: 'Confirmed',
  active: 'Active',
  expiring: 'Expiring soon',
  completed: 'Completed',
  cancelled: 'Cancelled',
  expired: 'Expired',
}

export const PHASE_TONE: Record<ReservationPhase, PillTone> = {
  pending: 'warning',
  confirmed: 'success',
  active: 'success',
  expiring: 'warning',
  completed: 'neutral',
  cancelled: 'danger',
  expired: 'neutral',
}

const EXPIRING_WINDOW_MS = 15 * 60_000

export function reservationPhase(
  status: ReservationStatus,
  startAt: string,
  endAt: string,
  now: number = Date.now(),
): ReservationPhase {
  if (status === 'reservation_cancelled') return 'cancelled'
  if (status === 'reservation_expired') return 'expired'
  if (status === 'reservation_completed') return 'completed'

  const start = new Date(startAt).getTime()
  const end = new Date(endAt).getTime()

  if (now > end) return 'completed'
  if (status === 'reservation_pending') return 'pending'
  if (now >= start) return end - now < EXPIRING_WINDOW_MS ? 'expiring' : 'active'
  return 'confirmed'
}

/** Whether the driver can still cancel (before the 1-hour cutoff). */
export function canCancel(
  status: ReservationStatus,
  startAt: string,
  now: number = Date.now(),
): boolean {
  if (status !== 'reservation_pending' && status !== 'reservation_confirmed') {
    return false
  }
  return now < new Date(startAt).getTime() - 60 * 60_000
}
