import { useCallback, useEffect, useState } from 'react'

import { listReservations } from '@/lib/reservations'

const SEEN_KEY = 'parkpilot.notifications.seen'
const CHANGE_EVENT = 'parkpilot:notifications-seen'

/**
 * Notifications are derived from reservations rather than pushed, so "unread"
 * means "a booking event happened since the driver last opened the list".
 */
export function getNotificationsSeenAt(): number {
  try {
    const raw = localStorage.getItem(SEEN_KEY)
    const parsed = raw ? Number(raw) : 0
    return Number.isFinite(parsed) ? parsed : 0
  } catch {
    return 0
  }
}

/** Mark every current notification as read and notify any listening badge. */
export function markNotificationsSeen(at: number = Date.now()): void {
  try {
    localStorage.setItem(SEEN_KEY, String(at))
  } catch {
    // Storage unavailable — the badge simply stays lit.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

/** Count of booking notifications created since the list was last opened. */
export function useUnreadNotificationCount(
  address: string | null | undefined,
): number {
  const [count, setCount] = useState(0)

  const refresh = useCallback(async () => {
    if (!address) {
      setCount(0)
      return
    }

    try {
      const seenAt = getNotificationsSeenAt()
      const summaries = await listReservations(address)
      const unread = summaries.filter(({ reservation }) => {
        const created = new Date(reservation.created_at).getTime()
        return Number.isFinite(created) && created > seenAt
      }).length
      setCount(unread)
    } catch {
      // Never let a badge failure surface to the driver.
      setCount(0)
    }
  }, [address])

  useEffect(() => {
    void refresh()
    window.addEventListener(CHANGE_EVENT, refresh)
    return () => window.removeEventListener(CHANGE_EVENT, refresh)
  }, [refresh])

  return count
}
