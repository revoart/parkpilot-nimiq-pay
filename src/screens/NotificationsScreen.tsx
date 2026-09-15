import { AlertTriangle, Bell, Check, Clock } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { AppShell } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { useWallet } from '@/hooks/useWallet'
import { markNotificationsSeen } from '@/lib/notifications/unread'
import {
  listReservations,
  type ReservationSummary,
} from '@/lib/reservations'
import { formatDateLabel, formatTimeLabel } from '@/utils/format'

interface Note {
  id: string
  title: string
  subtitle: string
  tone: 'green' | 'amber' | 'gray'
  time: string
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

function buildNotes(items: ReservationSummary[]): Note[] {
  return items.map(({ reservation, parkingSpace, payment }) => {
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
      }
    }

    return {
      id: reservation.id,
      title: confirmed ? 'Booking confirmed' : 'Awaiting payment',
      subtitle: `${parkingSpace.title} · ${formatDateLabel(reservation.start_at)} ${formatTimeLabel(reservation.start_at)}`,
      tone: confirmed ? ('green' as const) : ('gray' as const),
      time: relativeTime(reservation.created_at),
    }
  })
}

const TONE: Record<Note['tone'], { bg: string; icon: typeof Check }> = {
  green: { bg: 'bg-success-bg text-success', icon: Check },
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
      setNotes(buildNotes(await listReservations(wallet.address)))
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
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : error ? (
        <EmptyState
          title="Couldn't load notifications"
          description={error}
          action={
            <Button variant="secondary" size="md" onClick={() => void load()}>
              Retry
            </Button>
          }
        />
      ) : notes.length === 0 ? (
        <EmptyState
          icon={<Bell className="size-5" />}
          title="No notifications"
          description="Booking updates will appear here."
          action={
            <Button size="md" onClick={() => navigate('/')}>
              Find parking
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {notes.map((note) => {
            const tone = TONE[note.tone]
            const Icon = tone.icon
            return (
              <button
                key={note.id}
                type="button"
                onClick={() => navigate(`/pass/${note.id}`)}
                className="flex w-full items-center gap-2.5 rounded-2xl bg-surface-raised px-3 py-3 text-left"
              >
                <span
                  className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${tone.bg}`}
                >
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-semibold">
                    {note.title}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-ink-muted">
                    {note.subtitle}
                  </span>
                </span>
                <span className="shrink-0 text-[11px] font-medium text-ink-faint">
                  {note.time}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </AppShell>
  )
}
