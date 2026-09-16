import { CalendarClock, MessageSquare, RefreshCw, Search } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { AppShell } from '@/components/layout/AppShell'
import { ListingPhoto } from '@/components/parking/ListingPhoto'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { StatusPill } from '@/components/ui/StatusPill'
import { SwipeToDelete } from '@/components/ui/SwipeToDelete'
import { useWallet } from '@/hooks/useWallet'
import {
  canCancel,
  cancelReservation,
  listReservations,
  PHASE_LABEL,
  PHASE_TONE,
  reservationPhase,
  type ReservationSummary,
} from '@/lib/reservations'
import { formatDateLabel, formatTimeLabel, formatUsdt } from '@/utils/format'
import { cn } from '@/utils/cn'

type Tab = 'upcoming' | 'active' | 'past'

const TABS: Tab[] = ['upcoming', 'active', 'past']

function categorize(item: ReservationSummary, now: number): Tab {
  const { status, start_at, end_at } = item.reservation
  const start = new Date(start_at).getTime()
  const end = new Date(end_at).getTime()

  if (
    status === 'reservation_cancelled' ||
    status === 'reservation_expired' ||
    status === 'reservation_completed' ||
    end < now
  ) {
    return 'past'
  }
  if (start <= now && now <= end) return 'active'
  return 'upcoming'
}

export function MyParkingScreen() {
  const navigate = useNavigate()
  const wallet = useWallet()
  const [items, setItems] = useState<ReservationSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('upcoming')

  const [cancelTarget, setCancelTarget] = useState<ReservationSummary | null>(
    null,
  )
  const [cancelling, setCancelling] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!wallet.address) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      setItems(await listReservations(wallet.address))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load.')
    } finally {
      setLoading(false)
    }
  }, [wallet.address])

  useEffect(() => {
    void load()
  }, [load])

  const grouped = useMemo(() => {
    const now = Date.now()
    const buckets: Record<Tab, ReservationSummary[]> = {
      upcoming: [],
      active: [],
      past: [],
    }
    for (const item of items) buckets[categorize(item, now)].push(item)
    return buckets
  }, [items])

  const visible = grouped[tab]

  async function handleCancel() {
    if (!cancelTarget || !wallet.address) return
    setCancelling(true)
    setNotice(null)
    try {
      const result = await cancelReservation(
        wallet.address,
        cancelTarget.reservation.id,
      )
      setCancelTarget(null)
      setNotice(
        result.refund_owed
          ? 'Reservation cancelled. A refund is owed by the host per policy.'
          : 'Reservation cancelled.',
      )
      await load()
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Could not cancel.')
      setCancelTarget(null)
    } finally {
      setCancelling(false)
    }
  }

  if (!wallet.address) {
    return (
      <AppShell showBack title="My Parking">
        <EmptyState
          title="Connect your wallet"
          description="Connect Nimiq Pay to see your reservations."
          action={
            <Button size="md" onClick={() => void wallet.connect()}>
              Connect Wallet
            </Button>
          }
        />
      </AppShell>
    )
  }

  return (
    <AppShell showBack title="My Parking">
      <div className="space-y-3">
        <div className="flex gap-2">
          {TABS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              aria-pressed={tab === value}
              className={cn(
                'flex-1 rounded-full border px-3 py-2.5 text-[14px] font-bold capitalize transition-colors',
                tab === value
                  ? 'border-transparent bg-accent text-on-ink'
                  : 'border-line-strong bg-surface-raised text-ink-soft',
              )}
            >
              {value}
            </button>
          ))}
        </div>

        {notice ? (
          <p className="rounded-xl bg-surface-raised px-4 py-3 text-sm text-ink-soft">
            {notice}
          </p>
        ) : null}

        {loading ? (
          <div className="space-y-3" aria-busy="true">
            {[0, 1, 2].map((card) => (
              <div
                key={card}
                className="rounded-2xl bg-surface-raised p-3.5 shadow-[0_4px_12px_rgba(0,0,0,0.04)]"
              >
                <div className="flex items-center justify-between gap-2">
                  <Skeleton className="h-5 w-20 rounded-full" />
                  <Skeleton className="h-5 w-24 rounded-full" />
                </div>
                <div className="mt-4 space-y-2.5">
                  <Skeleton className="h-4 w-3/4 rounded-full" />
                  <Skeleton className="h-4 w-1/2 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <EmptyState
            tone="danger"
            title="Couldn't load reservations"
            description={error}
            action={
              <Button full size="md" onClick={() => void load()}>
                <RefreshCw className="mr-2 size-4" />
                Retry
              </Button>
            }
          />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<CalendarClock className="size-6" />}
            title={
              tab === 'upcoming'
                ? 'No upcoming bookings'
                : tab === 'active'
                  ? 'No active bookings'
                  : 'No past bookings'
            }
            description="When you reserve parking, your bookings will appear here."
            action={
              tab === 'upcoming' ? (
                <Button full size="md" onClick={() => navigate('/')}>
                  <Search className="mr-2 size-4" />
                  Find Parking
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="space-y-3">
            {visible.map((item) => {
              const phase = reservationPhase(
                item.reservation.status,
                item.reservation.start_at,
                item.reservation.end_at,
              )
              const cancellable = canCancel(
                item.reservation.status,
                item.reservation.start_at,
              )
              return (
                <SwipeToDelete
                  key={item.reservation.id}
                  label={cancellable ? 'Cancel' : 'Dismiss'}
                  onDelete={() => {
                    if (cancellable) setCancelTarget(item)
                  }}
                  disabled={!cancellable}
                >
                  <Card className="space-y-2.5">
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => navigate(`/pass/${item.reservation.id}`)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          navigate(`/pass/${item.reservation.id}`)
                        }
                      }}
                      className="cursor-pointer space-y-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <StatusPill
                          tone={PHASE_TONE[phase]}
                          className="px-2.5 py-1 uppercase tracking-[0.4px]"
                        >
                          {PHASE_LABEL[phase]}
                        </StatusPill>
                        <span className="shrink-0 rounded-full bg-brand/10 px-2.5 py-1 text-[12px] font-bold text-brand">
                          {formatUsdt(item.reservation.amount_usdt)} USDT
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <ListingPhoto
                          imageUrl={item.parkingSpace.image_url}
                          title={item.parkingSpace.title}
                          className="size-11 shrink-0 rounded-xl"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[17px] font-bold tracking-[-0.2px]">
                            {item.parkingSpace.title}
                          </p>
                          <p className="mt-0.5 truncate text-[13px] text-ink-muted">
                            {formatDateLabel(item.reservation.start_at)} ·{' '}
                            {formatTimeLabel(item.reservation.start_at)} –{' '}
                            {formatTimeLabel(item.reservation.end_at)}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center gap-4 border-t border-line pt-3">
                      <button
                        type="button"
                        onClick={() =>
                          navigate(`/messages/${item.reservation.id}`)
                        }
                        className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-brand"
                      >
                        <MessageSquare className="size-3.5" />
                        Message host
                      </button>

                      {cancellable ? (
                        <button
                          type="button"
                          onClick={() => setCancelTarget(item)}
                          className="ml-auto text-[12px] font-semibold text-danger"
                        >
                          Cancel reservation
                        </button>
                      ) : null}
                    </div>
                  </Card>
                </SwipeToDelete>
              )
            })}
          </div>
        )}
      </div>

      <BottomSheet
        open={cancelTarget !== null}
        title="Cancel reservation?"
        onClose={() => setCancelTarget(null)}
      >
        {cancelTarget ? (
          <div className="space-y-3">
            <p className="text-sm text-ink-soft">
              {cancelTarget.parkingSpace.title} ·{' '}
              {formatDateLabel(cancelTarget.reservation.start_at)},{' '}
              {formatTimeLabel(cancelTarget.reservation.start_at)}–
              {formatTimeLabel(cancelTarget.reservation.end_at)}
            </p>
            <p className="text-xs text-ink-muted">
              Free cancellation up to 1 hour before the start time. If this
              booking was already paid, the host will refund it per policy —
              ParkPilot cannot reverse a wallet transfer automatically.
            </p>
            <div className="flex gap-2">
              <Button
                full
                size="md"
                variant="danger"
                loading={cancelling}
                onClick={() => void handleCancel()}
              >
                Cancel reservation
              </Button>
              <Button
                full
                size="md"
                variant="secondary"
                onClick={() => setCancelTarget(null)}
              >
                Keep booking
              </Button>
            </div>
          </div>
        ) : null}
      </BottomSheet>
    </AppShell>
  )
}
