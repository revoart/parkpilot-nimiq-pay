import { ChevronRight, Plus, SquareParking } from 'lucide-react'
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
  const [earnedToday, setEarnedToday] = useState(0)
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
      setEarnedToday(earnings.today)
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
      <HostShell title="Your parking" subtitle="Host">
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
    <HostShell title="Your parking" subtitle="Host">
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : error ? (
        <EmptyState
          title="Couldn't load your dashboard"
          description={error}
          action={
            <Button variant="secondary" size="md" onClick={() => void load()}>
              Retry
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          <div className="flex gap-2">
            {[
              { value: String(activeSpaces), label: 'spaces live' },
              { value: formatUsdt(earnedToday), label: 'USDT today' },
              { value: String(upcoming.length), label: 'upcoming' },
            ].map((stat) => (
              <div
                key={stat.label}
                className="flex-1 rounded-xl bg-surface-raised px-2.5 py-2.5 text-center"
              >
                <p className="text-[19px] font-bold leading-none tracking-[-0.4px]">
                  {stat.value}
                </p>
                <p className="mt-1 text-[10px] font-medium leading-tight text-ink-muted">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>

          <div className="rounded-2xl bg-surface-raised p-3.5">
            <div className="mb-2.5 flex items-center justify-between">
              <p className="text-[14px] font-bold">Your spaces</p>
              <button
                type="button"
                onClick={() => navigate('/host/add')}
                className="text-[12px] font-bold"
              >
                + Add
              </button>
            </div>

            {spaces.length === 0 ? (
              <p className="py-1.5 text-[13px] text-ink-muted">
                No listings yet. Add your first parking space.
              </p>
            ) : (
              <div className="space-y-1.5">
                {spaces.slice(0, 5).map((space) => (
                  <SwipeToDelete
                    key={space.id}
                    label="Delete"
                    onDelete={() => setDeleteTarget(space)}
                  >
                    <button
                      type="button"
                      onClick={() => navigate(`/host/space/${space.id}`)}
                      className="flex w-full items-center justify-between gap-2.5 rounded-xl bg-surface px-3 py-2.5 text-left active:opacity-80"
                    >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <ListingPhoto
                        imageUrl={space.image_url}
                        title={space.title}
                        className="size-9 shrink-0 rounded-xl"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-[14px] font-bold">
                          {space.title}
                        </p>
                        <p className="truncate text-[11px] text-ink-muted">
                          {formatUsdt(space.price_usdt)}/hr · {space.address}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <StatusPill tone={space.active ? 'success' : 'neutral'}>
                        {space.active ? 'Active' : 'Paused'}
                      </StatusPill>
                      <ChevronRight className="size-3.5 text-ink-faint" />
                    </div>
                    </button>
                  </SwipeToDelete>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-surface-raised p-3.5">
            <p className="mb-2.5 text-[14px] font-bold">Upcoming bookings</p>
            {upcoming.length === 0 ? (
              <p className="py-2 text-sm text-ink-muted">
                No upcoming bookings yet.
              </p>
            ) : (
              <div className="space-y-3">
                {upcoming.slice(0, 3).map((booking) => (
                  <div
                    key={booking.id}
                    className="flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-semibold">
                        {booking.parkingSpaceTitle}
                      </p>
                      <p className="text-xs text-ink-muted">
                        {formatDateLabel(booking.startAt)} ·{' '}
                        {formatTimeLabel(booking.startAt)} –{' '}
                        {formatTimeLabel(booking.endAt)}
                      </p>
                    </div>
                    <p className="shrink-0 text-[14px] font-bold">
                      {formatUsdt(booking.amountUsdt)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Button full size="lg" onClick={() => navigate('/host/add')}>
            <Plus className="mr-2 size-4 opacity-70" />
            Add parking space
          </Button>
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
