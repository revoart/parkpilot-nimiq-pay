import { CalendarCheck, MessageSquare } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { NimiqMark } from '@/components/brand/NimiqMark'
import { HostShell } from '@/components/layout/HostShell'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { StatusPill, type PillTone } from '@/components/ui/StatusPill'
import { UsdEquivalent } from '@/components/ui/UsdEquivalent'
import { useWallet } from '@/hooks/useWallet'
import { listHostBookings, type HostBooking } from '@/lib/host'
import type { ReservationStatus } from '@/types'
import { formatDateLabel, formatTimeLabel, formatNim, shortenAddress } from '@/utils/format'
import { cn } from '@/utils/cn'

type Tab = 'upcoming' | 'past'

const TABS: { value: Tab; label: string }[] = [
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'past', label: 'Past History' },
]

const STATUS_LABEL: Record<ReservationStatus, string> = {
  reservation_pending: 'Pending',
  reservation_confirmed: 'Confirmed',
  reservation_cancelled: 'Cancelled',
  reservation_completed: 'Completed',
  reservation_expired: 'Expired',
}

const STATUS_TONE: Record<ReservationStatus, PillTone> = {
  reservation_pending: 'warning',
  reservation_confirmed: 'success',
  reservation_cancelled: 'danger',
  reservation_completed: 'neutral',
  reservation_expired: 'neutral',
}

function durationLabel(startAt: string, endAt: string): string | null {
  const minutes = Math.round(
    (new Date(endAt).getTime() - new Date(startAt).getTime()) / 60000,
  )
  if (!Number.isFinite(minutes) || minutes <= 0) return null
  if (minutes % 60 === 0) return `${minutes / 60} hrs`
  return `${minutes} min`
}

export function HostBookingsScreen() {
  const navigate = useNavigate()
  const wallet = useWallet()
  const [bookings, setBookings] = useState<HostBooking[]>([])
  const [tab, setTab] = useState<Tab>('upcoming')
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
      setBookings(await listHostBookings(wallet.address))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load.')
    } finally {
      setLoading(false)
    }
  }, [wallet.address])

  useEffect(() => {
    void load()
  }, [load])

  const visible = useMemo(() => {
    const now = Date.now()
    return bookings.filter((booking) => {
      const past =
        new Date(booking.endAt).getTime() < now ||
        booking.status === 'reservation_cancelled' ||
        booking.status === 'reservation_completed' ||
        booking.status === 'reservation_expired'
      return tab === 'past' ? past : !past
    })
  }, [bookings, tab])

  if (!wallet.address) {
    return (
      <HostShell title="Bookings" subtitle="Host">
        <EmptyState
          icon={<CalendarCheck className="size-5" />}
          title="Connect your wallet"
          description="Connect Nimiq Pay to see bookings for your spaces."
          action={
            <Button size="md" onClick={() => void wallet.connect()}>
              Connect Wallet
            </Button>
          }
        />
      </HostShell>
    )
  }

  return (
    <HostShell title="Bookings" subtitle="Host">
      <div className="space-y-4">
        <div className="flex rounded-full border border-line bg-surface-raised p-1">
          {TABS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              aria-pressed={tab === value}
              onClick={() => setTab(value)}
              className={cn(
                'flex-1 rounded-full px-4 py-2 text-[13px] font-bold transition-colors',
                tab === value
                  ? 'bg-brand-fill text-brand-fg shadow-[0_4px_12px_rgba(76,130,255,0.12)]'
                  : 'text-ink-muted',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        ) : error ? (
          <EmptyState
            title="Couldn't load bookings"
            description={error}
            action={
              <Button variant="secondary" size="md" onClick={() => void load()}>
                Retry
              </Button>
            }
          />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<CalendarCheck className="size-5" />}
            title={tab === 'upcoming' ? 'No upcoming bookings' : 'No past bookings'}
            description="Bookings for your parking spaces will appear here."
          />
        ) : (
          <div className="space-y-3">
            {visible.map((booking) => {
              const duration = durationLabel(booking.startAt, booking.endAt)
              const cleared = booking.paymentStatus === 'payment_confirmed'
              return (
                <article
                  key={booking.id}
                  className="rounded-2xl border border-line bg-surface-raised p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="min-w-0 flex-1 text-[17px] font-bold leading-[21px] tracking-[-0.3px]">
                      {booking.parkingSpaceTitle}
                    </h3>
                    <StatusPill
                      tone={STATUS_TONE[booking.status]}
                      className="shrink-0 uppercase tracking-[0.4px]"
                    >
                      {STATUS_LABEL[booking.status]}
                    </StatusPill>
                  </div>

                  {booking.parkingSpaceAddress ? (
                    <p className="mt-0.5 truncate text-[13px] text-ink-muted">
                      {booking.parkingSpaceAddress}
                    </p>
                  ) : null}

                  <p className="mt-1.5 text-[13px] text-ink-muted">
                    {formatDateLabel(booking.startAt)}{' '}
                    <span className="text-ink-faint">·</span>{' '}
                    <span className="font-semibold text-brand">
                      {formatTimeLabel(booking.startAt)} –{' '}
                      {formatTimeLabel(booking.endAt)}
                      {duration ? ` (${duration})` : ''}
                    </span>
                  </p>

                  {booking.txHash ? (
                    <p className="mt-0.5 font-mono text-[10px] text-ink-faint">
                      {shortenAddress(booking.txHash, 6)}
                    </p>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => navigate(`/messages/${booking.id}`)}
                    className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-semibold text-brand"
                  >
                    <MessageSquare className="size-3.5" />
                    Message driver
                  </button>

                  <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
                    <span className="text-[13px] text-ink-muted">
                      {cleared ? 'Earnings (On-Chain cleared)' : 'Earnings'}
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-2.5 py-1 text-[13px] font-bold text-brand">
                      <NimiqMark className="size-3.5" />
                      {formatNim(booking.amountNim)} NIM
                      <UsdEquivalent
                        nim={booking.amountNim}
                        className="text-[11px] font-medium text-ink-muted"
                      />
                    </span>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>
    </HostShell>
  )
}
