import { AlertTriangle, Bell, CheckCircle2, Clock, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { AppShell } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { useWallet } from '@/hooks/useWallet'
import {
  getNotificationsSeenAt,
  markNotificationsSeen,
} from '@/lib/notifications/unread'
import {
  listReservations,
  type ReservationSummary,
} from '@/lib/reservations'
import { cn } from '@/utils/cn'
import { formatDateLabel, formatTimeLabel } from '@/utils/format'

interface Note {
  id: string
  title: string
  subtitle: string
  tone: 'green' | 'amber' | 'gray'
  time: string
  unread: boolean
}

function relativeTime(value: string): string {
  const diff = Date.now() - new Date(value).getTime()
  const minutes = Math.round(diff / 60_000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days}d ago`
  return formatDateLabel(value)
}

function buildNotes(items: ReservationSummary[], seenAt: number): Note[] {
  return items.map(({ reservation, parkingSpace, payment }) => {
    const created = new Date(reservation.created_at).getTime()
    const unread = Number.isFinite(created) && created > seenAt
    const confirmed =
      reservation.status === 'reservation_confirmed' ||
      payment?.status === 'payment_confirmed'
    const cancelled = reservation.status === 'reservation_cancelled'
    const expired = reservation.status === 'reservation_expired'

    if (cancelled || expired) {
      return {
        id: reservation.id,
        title: cancelled ? 'Booking cancelled' : 'Booking expired',
        subtitle: `${parkingSpace.title} · ${
          cancelled ? 'cancelled' : 'payment window expired'
        }`,
        tone: 'amber' as const,
        time: relativeTime(reservation.created_at),
        unread,
      }
    }

    return {
      id: reservation.id,
      title: confirmed ? 'Booking confirmed' : 'Awaiting payment',
      subtitle: `${parkingSpace.title} · ${formatDateLabel(reservation.start_at)} ${formatTimeLabel(reservation.start_at)}`,
      tone: confirmed ? ('green' as const) : ('gray' as const),
      time: relativeTime(reservation.created_at),
      unread,
    }
  })
}

const TONE: Record<Note['tone'], { bg: string; icon: typeof CheckCircle2 }> = {
  green: { bg: 'bg-success-bg text-success', icon: CheckCircle2 },
  amber: { bg: 'bg-warning-bg text-warning', icon: AlertTriangle },
  gray: { bg: 'bg-surface text-ink-muted', icon: Clock },
}

export function NotificationsScreen() {
  const navigate = useNavigate()
  const wallet = useWallet()
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!wallet.address) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const seenAt = getNotificationsSeenAt()
      setNotes(buildNotes(await listReservations(wallet.address), seenAt))
      markNotificationsSeen()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load.')
    } finally {
      setLoading(false)
    }
  }, [wallet.address])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <AppShell showBack title="Notifications">
      {!wallet.address ? (
        <EmptyState
          icon={<Bell className="size-5" />}
          title="Connect your wallet"
          description="Connect Nimiq Pay to see your booking notifications."
          action={
            <Button size="md" onClick={() => void wallet.connect()}>
              Connect Wallet
            </Button>
          }
        />
      ) : loading ? (
        <div
          className="space-y-4 overflow-hidden rounded-2xl border border-line bg-surface-raised p-4"
          aria-busy="true"
        >
          {[0, 1, 2].map((row) => (
            <div key={row} className="flex items-center gap-2.5">
              <Skeleton className="size-9 shrink-0 rounded-xl" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-3.5 w-1/2 rounded-full" />
                <Skeleton className="h-3 w-3/4 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <EmptyState
          tone="danger"
          title="Couldn't load notifications"
          description={error}
          action={
            <Button full size="md" onClick={() => void load()}>
              <RefreshCw className="mr-2 size-4" />
              Retry
            </Button>
          }
        />
      ) : notes.length === 0 ? (
        <EmptyState
          icon={<Bell className="size-6" />}
          title="No notifications yet"
          description="You'll be notified about booking updates and reminders."
        />
      ) : (
        <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface-raised">
          {notes.map((note) => {
            const tone = TONE[note.tone]
            const Icon = tone.icon
            return (
              <button
                key={note.id}
                type="button"
                onClick={() => navigate(`/pass/${note.id}`)}
                className="flex w-full items-center gap-2.5 px-4 py-3.5 text-left transition active:bg-surface"
              >
                <span
                  className="flex size-2 shrink-0 items-center justify-center"
                  aria-hidden="true"
                >
                  {note.unread ? (
                    <span className="size-2 rounded-full bg-brand" />
                  ) : null}
                </span>
                <span
                  className={cn(
                    'flex size-9 shrink-0 items-center justify-center rounded-xl',
                    tone.bg,
                  )}
                >
                  <Icon className="size-[18px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-bold leading-[19px] tracking-[-0.2px]">
                    {note.title}
                  </span>
                  <span className="mt-0.5 block text-[13px] leading-[18px] text-ink-muted">
                    {note.subtitle}
                  </span>
                  <span className="mt-0.5 block text-[12px] text-ink-faint">
                    {note.time}
                  </span>
                </span>
                {note.unread ? (
                  <span className="sr-only">Unread</span>
                ) : null}
              </button>
            )
          })}
        </div>
      )}
    </AppShell>
  )
}
