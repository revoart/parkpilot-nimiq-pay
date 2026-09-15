import { CalendarCheck } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { HostShell } from '@/components/layout/HostShell'
import { ListingPhoto } from '@/components/parking/ListingPhoto'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { StatusPill, type PillTone } from '@/components/ui/StatusPill'
import { useWallet } from '@/hooks/useWallet'
import { listHostBookings, type HostBooking } from '@/lib/host'
import type { ReservationStatus } from '@/types'
import { formatDateLabel, formatTimeLabel, formatUsdt, shortenAddress } from '@/utils/format'
import { cn } from '@/utils/cn'

type Tab = 'upcoming' | 'past'

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

export function HostBookingsScreen() {
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
      <div className="space-y-3">
        <div className="flex gap-1.5">
          {(['upcoming', 'past'] as Tab[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className={cn(
                'rounded-xl px-4 py-2 text-[13px] font-bold capitalize transition-colors',
                tab === value ? 'bg-ink text-on-ink' : 'bg-surface text-ink-muted',
              )}
            >
              {value}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
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
          <div className="space-y-2">
            {visible.map((booking) => (
              <div
                key={booking.id}
                className="rounded-2xl bg-surface-raised p-3"
              >
                <div className="flex items-start gap-2.5">
                  <ListingPhoto
                    imageUrl={booking.parkingSpaceImageUrl}
                    title={booking.parkingSpaceTitle}
                    className="size-12 shrink-0 rounded-xl"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-bold">
                      {booking.parkingSpaceTitle}
                    </p>
                    <p className="mt-0.5 text-[12px] text-ink-muted">
                      {formatDateLabel(booking.startAt)} ·{' '}
                      {formatTimeLabel(booking.startAt)} –{' '}
                      {formatTimeLabel(booking.endAt)}
                    </p>
                    <p className="mt-0.5 font-mono text-[10px] text-ink-faint">
                      {shortenAddress(booking.txHash ?? booking.id, 6)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[14px] font-bold">
                      {formatUsdt(booking.amountUsdt)}
                    </p>
                    <div className="mt-1">
                      <StatusPill tone={STATUS_TONE[booking.status]}>
                        {STATUS_LABEL[booking.status]}
                      </StatusPill>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </HostShell>
  )
}
