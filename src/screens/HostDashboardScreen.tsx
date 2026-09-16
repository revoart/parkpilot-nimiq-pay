import { House, Plus, RefreshCw, SquareParking } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { HostShell } from '@/components/layout/HostShell'
import { ListingPhoto } from '@/components/parking/ListingPhoto'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { StatusPill } from '@/components/ui/StatusPill'
import { SwipeToDelete } from '@/components/ui/SwipeToDelete'
import { useToast } from '@/components/ui/Toast'
import { useWallet } from '@/hooks/useWallet'
import {
  deleteParkingSpace,
  getHostEarnings,
  listHostBookings,
  listHostSpaces,
  type HostBooking,
  type HostSpace,
} from '@/lib/host'
import { formatDateLabel, formatTimeLabel, formatUsdt } from '@/utils/format'

export function HostDashboardScreen() {
  const navigate = useNavigate()
  const wallet = useWallet()
  const toast = useToast()

  const [spaces, setSpaces] = useState<HostSpace[]>([])
  const [bookings, setBookings] = useState<HostBooking[]>([])
  const [earnedAllTime, setEarnedAllTime] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<HostSpace | null>(null)
  const [deleting, setDeleting] = useState(false)

  async function confirmDelete() {
    if (!deleteTarget || !wallet.address) return
    setDeleting(true)
    try {
      await deleteParkingSpace(wallet.address, deleteTarget.id)
      toast.show('Listing deleted.', 'success')
      setDeleteTarget(null)
      await load()
    } catch (err) {
      toast.show(
        err instanceof Error ? err.message : 'Could not delete the listing.',
        'error',
      )
      setDeleteTarget(null)
    } finally {
      setDeleting(false)
    }
  }

  const load = useCallback(async () => {
    if (!wallet.address) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const [spaceList, bookingList, earnings] = await Promise.all([
        listHostSpaces(wallet.address),
        listHostBookings(wallet.address),
        getHostEarnings(wallet.address),
      ])
      setSpaces(spaceList)
      setBookings(bookingList)
      setEarnedAllTime(earnings.allTime)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load.')
    } finally {
      setLoading(false)
    }
  }, [wallet.address])

  useEffect(() => {
    void load()
  }, [load])

  const upcoming = useMemo(() => {
    const now = Date.now()
    return bookings
      .filter(
        (booking) =>
          booking.status === 'reservation_confirmed' &&
          new Date(booking.startAt).getTime() > now,
      )
      .sort(
        (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
      )
  }, [bookings])

  const activeSpaces = spaces.filter((space) => space.active).length

  if (!wallet.address) {
    return (
      <HostShell title="Host Dashboard">
        <EmptyState
          icon={<SquareParking className="size-5" />}
          title="Connect your wallet"
          description="Connect Nimiq Pay to manage your parking spaces."
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
    <HostShell
      title="Host Dashboard"
      footer={
        // The no-wallet state returns its own shell above, so only the loading
        // and error branches still need excluding here.
        !loading && !error ? (
          <Button full size="lg" onClick={() => navigate('/host/add')}>
            Add Parking Space
          </Button>
        ) : null
      }
    >
      {loading ? (
        <div className="space-y-5" aria-busy="true">
          <div className="grid grid-cols-3 gap-2.5">
            {[0, 1, 2].map((stat) => (
              <div
                key={stat}
                className="rounded-2xl bg-surface-raised px-3 py-3 shadow-[0_4px_12px_rgba(0,0,0,0.04)]"
              >
                <Skeleton className="h-3 w-16 rounded-full" />
                <Skeleton className="mt-2 h-5 w-12 rounded-full" />
              </div>
            ))}
          </div>

          <section className="space-y-2.5">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.8px] text-ink-faint">
              My parking spaces
            </h2>
            <div className="space-y-2.5">
              {[0, 1].map((card) => (
                <div
                  key={card}
                  className="flex items-center gap-3 rounded-2xl bg-surface-raised p-2.5 shadow-[0_4px_12px_rgba(0,0,0,0.04)]"
                >
                  <Skeleton className="size-16 shrink-0 rounded-xl" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <Skeleton className="h-4 w-2/3 rounded-full" />
                      <Skeleton className="h-5 w-14 shrink-0 rounded-full" />
                    </div>
                    <Skeleton className="h-3 w-1/2 rounded-full" />
                    <Skeleton className="h-3.5 w-24 rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-2.5">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.8px] text-ink-faint">
              Upcoming bookings
            </h2>
            <div className="space-y-2.5">
              {[0, 1].map((card) => (
                <div
                  key={card}
                  className="flex items-start justify-between gap-3 rounded-2xl bg-surface-raised p-3.5 shadow-[0_4px_12px_rgba(0,0,0,0.04)]"
                >
                  <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="h-4 w-2/3 rounded-full" />
                    <Skeleton className="h-3 w-3/4 rounded-full" />
                    <Skeleton className="h-3 w-1/2 rounded-full" />
                  </div>
                  <Skeleton className="h-5 w-20 shrink-0 rounded-full" />
                </div>
              ))}
            </div>
          </section>

          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
      ) : error ? (
        <EmptyState
          tone="danger"
          title="Couldn't load your dashboard"
          description={error}
          action={
            <Button full size="md" onClick={() => void load()}>
              <RefreshCw className="mr-2 size-4" />
              Retry
            </Button>
          }
        />
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-2.5">
            {[
              { label: 'Earnings', value: formatUsdt(earnedAllTime), tether: true },
              { label: 'Active spaces', value: String(activeSpaces), tether: false },
              { label: 'Bookings', value: String(bookings.length), tether: false },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-2xl bg-surface-raised px-3 py-3 shadow-[0_4px_12px_rgba(0,0,0,0.04)]"
              >
                <p className="text-[10px] font-bold uppercase leading-none tracking-[0.6px] text-ink-faint">
                  {stat.label}
                </p>
                <p className="mt-1.5 flex items-center gap-1 text-[20px] font-extrabold leading-none tracking-[-0.5px]">
                  {stat.tether ? (
                    <span aria-hidden="true" className="text-[15px] text-success">
                      ₮
                    </span>
                  ) : null}
                  {stat.value}
                </p>
              </div>
            ))}
          </div>

          <section className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h2 className="text-[11px] font-bold uppercase tracking-[0.8px] text-ink-faint">
                My parking spaces
              </h2>
              <button
                type="button"
                onClick={() => navigate('/host/add')}
                className="text-[12px] font-bold text-brand"
              >
                + Add
              </button>
            </div>

            {spaces.length === 0 ? (
              <EmptyState
                icon={<House className="size-6" />}
                title="No parking spaces yet"
                description="List your first parking space and start earning USDT."
                action={
                  <Button full size="md" onClick={() => navigate('/host/add')}>
                    <Plus className="mr-2 size-4" />
                    Add Parking Space
                  </Button>
                }
              />
            ) : (
              <div className="space-y-2.5">
                {spaces.slice(0, 5).map((space) => (
                  <SwipeToDelete
                    key={space.id}
                    label="Delete"
                    onDelete={() => setDeleteTarget(space)}
                  >
                    <button
                      type="button"
                      onClick={() => navigate(`/host/space/${space.id}`)}
                      className="flex w-full items-center gap-3 rounded-2xl bg-surface-raised p-2.5 text-left shadow-[0_4px_12px_rgba(0,0,0,0.04)] active:opacity-80"
                    >
                      <ListingPhoto
                        imageUrl={space.image_url}
                        title={space.title}
                        className="size-16 shrink-0 rounded-xl"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="truncate text-[16px] font-bold tracking-[-0.3px]">
                            {space.title}
                          </p>
                          <StatusPill tone={space.active ? 'success' : 'neutral'}>
                            {space.active ? 'Active' : 'Paused'}
                          </StatusPill>
                        </div>
                        <p className="mt-0.5 truncate text-[13px] text-ink-muted">
                          {space.address}
                        </p>
                        <p className="mt-0.5 text-[14px] font-bold text-brand">
                          {formatUsdt(space.price_usdt)} USDT/hr
                        </p>
                      </div>
                    </button>
                  </SwipeToDelete>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-2.5">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.8px] text-ink-faint">
              Upcoming bookings
            </h2>
            {upcoming.length === 0 ? (
              <div className="rounded-2xl bg-surface-raised px-4 py-5 text-center shadow-[0_4px_12px_rgba(0,0,0,0.04)]">
                <p className="text-[14px] text-ink-muted">
                  No upcoming bookings
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {upcoming.slice(0, 3).map((booking) => (
                  <div
                    key={booking.id}
                    className="flex items-start justify-between gap-3 rounded-2xl bg-surface-raised p-3.5 shadow-[0_4px_12px_rgba(0,0,0,0.04)]"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[16px] font-bold tracking-[-0.3px]">
                        {booking.parkingSpaceTitle}
                      </p>
                      <p className="mt-0.5 text-[13px] text-ink-muted">
                        {formatDateLabel(booking.startAt)} ·{' '}
                        {formatTimeLabel(booking.startAt)} –{' '}
                        {formatTimeLabel(booking.endAt)}
                      </p>
                    </div>
                    <p className="shrink-0 text-[15px] font-bold text-success">
                      {formatUsdt(booking.amountUsdt)} USDT
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      <BottomSheet
        open={deleteTarget !== null}
        title="Delete listing?"
        onClose={() => setDeleteTarget(null)}
      >
        <div className="space-y-3 pb-1">
          <p className="text-[13px] text-ink-soft">{deleteTarget?.title}</p>
          <p className="text-[12px] text-ink-muted">
            This removes the listing and its photo. Listings with bookings cannot
            be deleted — pause them instead.
          </p>
          <div className="flex gap-2">
            <Button
              full
              size="md"
              variant="danger"
              loading={deleting}
              onClick={() => void confirmDelete()}
            >
              Delete
            </Button>
            <Button
              full
              size="md"
              variant="secondary"
              onClick={() => setDeleteTarget(null)}
            >
              Keep
            </Button>
          </div>
        </div>
      </BottomSheet>
    </HostShell>
  )
}
