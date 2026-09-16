import { AlertTriangle, CheckCircle2, RefreshCw, User } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { AppShell } from '@/components/layout/AppShell'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { destinationQueryWith } from '@/hooks/useDestination'
import { useWalkingRoute } from '@/hooks/useWalkingRoute'
import { useWallet } from '@/hooks/useWallet'
import {
  canCancel,
  cancelReservation,
  createReservation,
  getReservation,
  type ReservationDetails,
} from '@/lib/reservations'
import { formatWalkDistance, formatWalkTime } from '@/lib/routing'
import type { Destination } from '@/types'
import { cn } from '@/utils/cn'
import { formatDateLabel, formatTimeLabel } from '@/utils/format'

type Phase = 'upcoming' | 'active' | 'expiring' | 'complete'

const EXTEND_OPTIONS = [30, 60, 120, 180]

const RING_RADIUS = 70
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

function useCountdown(target: string | null): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  if (!target) return 0
  return Math.max(0, new Date(target).getTime() - now)
}

function formatCountdown(ms: number): string {
  const total = Math.floor(ms / 1000)
  const hours = String(Math.floor(total / 3600)).padStart(2, '0')
  const minutes = String(Math.floor((total % 3600) / 60)).padStart(2, '0')
  const seconds = String(total % 60).padStart(2, '0')
  return `${hours}:${minutes}:${seconds}`
}

export function SessionScreen() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const wallet = useWallet()

  const [details, setDetails] = useState<ReservationDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showExtend, setShowExtend] = useState(false)
  const [extending, setExtending] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const destination = useMemo<Destination | null>(() => {
    const row = details?.reservation
    if (
      !row?.destination_name ||
      row.destination_lat === null ||
      row.destination_lng === null
    ) {
      return null
    }
    return {
      name: row.destination_name,
      address: row.destination_address,
      lat: row.destination_lat,
      lng: row.destination_lng,
    }
  }, [details])

  const { route: walkRoute } = useWalkingRoute(
    details
      ? {
          lat: details.parkingSpace.latitude,
          lng: details.parkingSpace.longitude,
        }
      : null,
    destination ? { lat: destination.lat, lng: destination.lng } : null,
  )

  const load = useCallback(async () => {
    if (!id || !wallet.address) return
    setLoading(true)
    setError(null)
    try {
      setDetails(await getReservation(id, wallet.address))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load session.')
    } finally {
      setLoading(false)
    }
  }, [id, wallet.address])

  useEffect(() => {
    void load()
  }, [load])

  const remaining = useCountdown(details?.reservation.end_at ?? null)

  const phase: Phase = useMemo(() => {
    if (!details) return 'upcoming'
    const now = Date.now()
    const start = new Date(details.reservation.start_at).getTime()
    const end = new Date(details.reservation.end_at).getTime()
    if (now < start) return 'upcoming'
    if (now > end) return 'complete'
    if (end - now < 15 * 60_000) return 'expiring'
    return 'active'
  }, [details])

  async function handleExtend(minutes: number) {
    if (!details || !wallet.address) return
    setExtending(true)
    setError(null)
    try {
      const start = new Date(details.reservation.end_at)
      const end = new Date(start.getTime() + minutes * 60_000)

      const result = await createReservation({
        parkingSpaceId: details.reservation.parking_space_id,
        nimiqAddress: wallet.address,
        startAt: start.toISOString(),
        endAt: end.toISOString(),
      })
      navigate(`/payment/${result.reservation_id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not extend.')
      setExtending(false)
    }
  }

  async function handleCancel() {
    if (!details || !wallet.address) return
    setCancelling(true)
    setNotice(null)
    try {
      const result = await cancelReservation(
        wallet.address,
        details.reservation.id,
      )
      setConfirmCancel(false)
      setNotice(
        result.refund_owed
          ? 'Reservation cancelled. A refund is owed by the host per policy.'
          : 'Reservation cancelled.',
      )
      await load()
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Could not cancel.')
      setConfirmCancel(false)
    } finally {
      setCancelling(false)
    }
  }

  if (!wallet.address) {
    return (
      <AppShell showBack title="Parking session">
        <EmptyState
          title="Connect your wallet"
          description="Connect Nimiq Pay to view this session."
          action={
            <Button size="md" onClick={() => void wallet.connect()}>
              Connect Wallet
            </Button>
          }
        />
      </AppShell>
    )
  }

  if (loading) {
    return (
      <AppShell showBack title="Parking session">
        <div className="space-y-3" aria-busy="true">
          <div className="rounded-2xl bg-surface-raised px-4 py-5 shadow-[0_4px_12px_rgba(0,0,0,0.04)]">
            <div className="flex justify-center">
              <Skeleton className="h-4 w-36 rounded-full" />
            </div>
            <div className="mt-5 flex justify-center">
              <Skeleton className="size-40 rounded-full" />
            </div>
            <div className="mt-5 flex items-center justify-between gap-3 border-t border-line pt-4">
              <div className="space-y-2">
                <Skeleton className="h-3.5 w-28 rounded-full" />
                <Skeleton className="h-3 w-40 rounded-full" />
              </div>
              <Skeleton className="h-9 w-20 shrink-0 rounded-full" />
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-2xl bg-surface-raised p-4 shadow-[0_4px_12px_rgba(0,0,0,0.04)]">
            <Skeleton className="size-11 shrink-0 rounded-xl" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-40 rounded-full" />
              <Skeleton className="h-3 w-56 rounded-full" />
            </div>
          </div>

          <div className="space-y-4 rounded-2xl bg-surface-raised p-4 shadow-[0_4px_12px_rgba(0,0,0,0.04)]">
            <Skeleton className="h-3 w-40 rounded-full" />
            {[0, 1, 2].map((row) => (
              <div key={row} className="flex items-center justify-between gap-3">
                <Skeleton className="h-3.5 w-20 rounded-full" />
                <Skeleton className="h-3.5 w-32 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </AppShell>
    )
  }

  if (error && !details) {
    return (
      <AppShell showBack title="Parking session">
        <EmptyState
          tone="danger"
          title="Session unavailable"
          description={error}
          action={
            <Button full size="md" onClick={() => void load()}>
              <RefreshCw className="mr-2 size-4" />
              Refresh
            </Button>
          }
        />
      </AppShell>
    )
  }

  if (!details) return null

  const { reservation, parkingSpace } = details
  const sessionMs =
    new Date(reservation.end_at).getTime() -
    new Date(reservation.start_at).getTime()
  const remainingFraction =
    sessionMs > 0 ? Math.min(1, Math.max(0, remaining / sessionMs)) : 0

  const destinationLabel = [destination?.name, destination?.address]
    .filter(Boolean)
    .join(', ')
  const destinationMeta = [
    destinationLabel,
    walkRoute
      ? `${formatWalkTime(walkRoute.durationSeconds)} walk (${formatWalkDistance(walkRoute.distanceMeters)})`
      : null,
  ]
    .filter(Boolean)
    .join(' · ')

  const receipt = [
    { label: 'Garage', value: parkingSpace.title },
    {
      label: 'Arrival',
      value: `${formatTimeLabel(reservation.start_at)} · ${formatDateLabel(reservation.start_at)}`,
    },
    {
      label: 'Scheduled Departure',
      value: `${formatTimeLabel(reservation.end_at)} · ${formatDateLabel(reservation.end_at)}`,
    },
  ]

  const headerTitle =
    phase === 'active' || phase === 'expiring'
      ? 'Active Session'
      : 'Parking session'

  return (
    <AppShell
      showBack
      title={headerTitle}
      footer={
        <div className="space-y-2">
          <Button
            variant="ghost"
            full
            size="lg"
            onClick={() => navigate(`/pass/${reservation.id}`)}
          >
            View parking pass
          </Button>
          {phase === 'complete' ? (
            <Button
              full
              size="lg"
              variant="secondary"
              onClick={() => navigate(`/parking/${parkingSpace.id}`)}
            >
              Book this space again
            </Button>
          ) : null}
        </div>
      }
    >
      <div className="space-y-3">
        <Card className="flex flex-col items-center gap-5 py-5">
          {phase === 'complete' ? (
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-4 text-success" />
              <span className="text-[11px] font-extrabold uppercase tracking-[1.5px] text-ink">
                Session complete
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2" role="status" aria-live="polite">
              <span
                aria-hidden="true"
                className={cn(
                  'size-2 rounded-full',
                  phase === 'upcoming' ? 'bg-ink-faint' : 'bg-brand',
                )}
              />
              <span className="text-[11px] font-extrabold uppercase tracking-[1.5px] text-ink">
                {phase === 'upcoming' ? 'Upcoming' : 'Currently parked'}
              </span>
            </div>
          )}

          {phase === 'active' || phase === 'expiring' ? (
            <div className="relative flex size-40 items-center justify-center">
              <svg
                className="absolute inset-0 size-full -rotate-90"
                viewBox="0 0 160 160"
                aria-hidden="true"
              >
                <circle
                  cx="80"
                  cy="80"
                  r={RING_RADIUS}
                  fill="none"
                  stroke="var(--color-line)"
                  strokeWidth="8"
                />
                <circle
                  cx="80"
                  cy="80"
                  r={RING_RADIUS}
                  fill="none"
                  stroke="var(--color-brand)"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={RING_CIRCUMFERENCE}
                  strokeDashoffset={
                    RING_CIRCUMFERENCE * (1 - remainingFraction)
                  }
                />
              </svg>
              <div className="text-center">
                <p className="text-[30px] font-extrabold leading-none tracking-[-1px] tabular-nums">
                  {formatCountdown(remaining)}
                </p>
                <p className="mt-2 text-[11px] font-bold uppercase tracking-[1.5px] text-ink-muted">
                  Time remaining
                </p>
              </div>
            </div>
          ) : (
            <p className="text-[15px] font-semibold text-ink-soft">
              {phase === 'upcoming'
                ? `Starts ${formatTimeLabel(reservation.start_at)}`
                : `Ended ${formatTimeLabel(reservation.end_at)}`}
            </p>
          )}

          {phase !== 'complete' ? (
            <div className="flex w-full items-center justify-between gap-3 border-t border-line pt-4">
              <div className="min-w-0">
                <p className="text-[11px] font-extrabold uppercase tracking-[0.8px] text-ink">
                  Need more time?
                </p>
                <p className="mt-0.5 text-[13px] text-ink-muted">
                  Instantly append to session
                </p>
              </div>
              <button
                type="button"
                aria-label="Extend session"
                aria-expanded={showExtend}
                onClick={() => setShowExtend(true)}
                className="shrink-0 rounded-full border border-brand/40 bg-brand/5 px-3.5 py-2 text-[13px] font-bold text-brand transition active:scale-[0.97]"
              >
                +30 min
              </button>
            </div>
          ) : null}
        </Card>

        {destination ? (
          <Card>
            <button
              type="button"
              aria-label={`Walk to ${destination.name}`}
              onClick={() =>
                navigate(
                  `/navigate/${parkingSpace.id}${destinationQueryWith(destination, { leg: 'walk' })}`,
                )
              }
              className="flex w-full items-center gap-3 text-left"
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-surface">
                <User className="size-5 text-ink" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-bold text-ink">
                  Walking Destination
                </span>
                <span className="mt-0.5 block truncate text-[13px] text-ink-muted">
                  {destinationMeta}
                </span>
              </span>
            </button>
          </Card>
        ) : null}

        <Card className="space-y-1">
          <p className="text-[11px] font-extrabold uppercase tracking-[1.2px] text-ink-faint">
            Booking receipt details
          </p>
          <dl>
            {receipt.map((row) => (
              <div
                key={row.label}
                className="flex items-center justify-between gap-3 border-b border-dashed border-line py-3 last:border-0"
              >
                <dt className="text-[14px] text-ink-muted">{row.label}</dt>
                <dd className="truncate text-right text-[14px] font-semibold text-ink">
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        </Card>

        {phase === 'active' || phase === 'expiring' ? (
          <div className="flex items-start gap-2.5 rounded-2xl bg-danger-bg px-3.5 py-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" />
            <p className="text-[13px] font-semibold leading-snug text-danger">
              Releasing slot early forfeits remaining unaccrued time.
            </p>
          </div>
        ) : null}

        {showExtend ? (
          <Card className="space-y-3">
            <p className="text-[15px] font-bold">Extend by</p>
            <div className="grid grid-cols-2 gap-2">
              {EXTEND_OPTIONS.map((minutes) => (
                <Button
                  key={minutes}
                  size="md"
                  variant="secondary"
                  disabled={extending}
                  onClick={() => void handleExtend(minutes)}
                >
                  +{minutes >= 60 ? `${minutes / 60} hr` : `${minutes} min`}
                </Button>
              ))}
            </div>
            <p className="text-[13px] text-ink-muted">
              Extending books the next available slot and is paid in NIM.
            </p>
            <Button
              size="md"
              variant="ghost"
              full
              onClick={() => setShowExtend(false)}
            >
              Cancel
            </Button>
          </Card>
        ) : null}

        {error ? <p className="text-sm text-danger">{error}</p> : null}

        {notice ? (
          <p className="rounded-xl bg-surface-raised px-4 py-3 text-sm text-ink-soft">
            {notice}
          </p>
        ) : null}

        {canCancel(reservation.status, reservation.start_at) ? (
          <Button
            variant="ghost"
            full
            size="lg"
            onClick={() => setConfirmCancel(true)}
          >
            Cancel reservation
          </Button>
        ) : null}
      </div>

      <BottomSheet
        open={confirmCancel}
        title="Cancel reservation?"
        onClose={() => setConfirmCancel(false)}
      >
        <div className="space-y-3">
          <p className="text-sm text-ink-soft">{parkingSpace.title}</p>
          <p className="text-xs text-ink-muted">
            Free cancellation up to 1 hour before the start time. If this
            booking was already paid, the host refunds it per policy — ParkPilot
            cannot reverse a wallet transfer automatically.
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
              onClick={() => setConfirmCancel(false)}
            >
              Keep booking
            </Button>
          </div>
        </div>
      </BottomSheet>
    </AppShell>
  )
}
