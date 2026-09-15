import { AlertTriangle, CheckCircle2, Footprints, MapPin, Plus, Target } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { AppShell } from '@/components/layout/AppShell'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { StatusPill } from '@/components/ui/StatusPill'
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
import { formatWalkTime } from '@/lib/routing'
import type { Destination } from '@/types'
import { cn } from '@/utils/cn'
import { formatDateLabel, formatTimeLabel, formatUsdt } from '@/utils/format'

type Phase = 'upcoming' | 'active' | 'expiring' | 'complete'

const EXTEND_OPTIONS = [30, 60, 120, 180]

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
        evmAddress: wallet.address,
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
        <div className="space-y-3">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </AppShell>
    )
  }

  if (error && !details) {
    return (
      <AppShell showBack title="Parking session">
        <EmptyState title="Session not found" description={error} />
      </AppShell>
    )
  }

  if (!details) return null

  const { reservation, parkingSpace } = details
  const progress =
    phase === 'complete'
      ? 100
      : phase === 'upcoming'
        ? 0
        : Math.min(
            100,
            Math.max(
              0,
              100 -
                (remaining /
                  (new Date(reservation.end_at).getTime() -
                    new Date(reservation.start_at).getTime())) *
                  100,
            ),
          )

  return (
    <AppShell showBack title="Parking session">
      <div className="space-y-3">
        <Card className="flex flex-col items-center py-5 text-center">
          {phase === 'complete' ? (
            <CheckCircle2 className="mb-3 size-9 text-success" />
          ) : phase === 'expiring' ? (
            <AlertTriangle className="mb-3 size-9 text-warning" />
          ) : (
            <span className="mb-3 flex items-center gap-2">
              <span
                className={cn(
                  'size-2 rounded-full',
                  phase === 'upcoming' ? 'bg-ink-faint' : 'bg-success',
                )}
              />
              <span className="text-sm font-semibold text-ink-muted">
                {phase === 'upcoming' ? 'Upcoming' : 'Active session'}
              </span>
            </span>
          )}

          <h1
            className="text-[18px] font-bold tracking-[-0.3px]"
            role="status"
            aria-live="polite"
          >
            {phase === 'complete'
              ? 'Session complete'
              : phase === 'upcoming'
                ? 'Starts soon'
                : "You're parked"}
          </h1>
          <p className="mt-1 text-sm text-ink-muted">{parkingSpace.title}</p>

          {phase !== 'complete' && phase !== 'upcoming' ? (
            <div className="relative mt-6 flex size-44 items-center justify-center">
              <svg
                className="absolute inset-0 size-full -rotate-90"
                viewBox="0 0 176 176"
              >
                <circle
                  cx="88"
                  cy="88"
                  r="76"
                  fill="none"
                  stroke="var(--color-line)"
                  strokeWidth="8"
                />
                <circle
                  cx="88"
                  cy="88"
                  r="76"
                  fill="none"
                  stroke="var(--color-ink)"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 76}
                  strokeDashoffset={2 * Math.PI * 76 * (1 - progress / 100)}
                />
              </svg>
              <div className="text-center">
                <p className="text-[10px] font-bold uppercase tracking-widest text-ink-faint">
                  Time left
                </p>
                <p className="font-mono text-[26px] font-bold leading-none">
                  {formatCountdown(remaining)}
                </p>
                <p className="mt-1.5 text-xs text-ink-muted">
                  Ends {formatTimeLabel(reservation.end_at)}
                </p>
              </div>
            </div>
          ) : null}
        </Card>

        {destination ? (
          <Card className="space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-[1.2px] text-ink-faint">
              Your destination
            </p>
            <div className="flex items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface">
                <Target className="size-4 text-ink" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[15px] font-bold">
                  {destination.name}
                </p>
                <p className="text-xs text-ink-muted">
                  {walkRoute
                    ? `${formatWalkTime(walkRoute.durationSeconds)} walk from your parking`
                    : 'From your parking space'}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              full
              size="lg"
              onClick={() =>
                navigate(
                  `/navigate/${parkingSpace.id}${destinationQueryWith(destination, { leg: 'walk' })}`,
                )
              }
            >
              <Footprints className="size-4" />
              Walk to Destination
            </Button>
          </Card>
        ) : null}

        <Card className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-ink-muted">Date</span>
            <span className="text-sm font-semibold">
              {formatDateLabel(reservation.start_at)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-ink-muted">Time</span>
            <span className="text-sm font-semibold">
              {formatTimeLabel(reservation.start_at)} –{' '}
              {formatTimeLabel(reservation.end_at)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-ink-muted">Amount</span>
            <span className="text-sm font-semibold">
              {formatUsdt(reservation.amount_usdt)} USDT
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-ink-muted">Status</span>
            <StatusPill
              tone={phase === 'complete' ? 'neutral' : 'success'}
            >
              {phase === 'complete' ? 'Completed' : 'Confirmed'}
            </StatusPill>
          </div>
          <p className="flex items-center gap-1 pt-1 text-xs text-ink-muted">
            <MapPin className="size-3.5" />
            {parkingSpace.address}
          </p>
        </Card>

        {phase !== 'complete' ? (
          showExtend ? (
            <Card className="space-y-3">
              <p className="text-sm font-semibold">Extend by</p>
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
              <p className="text-xs text-ink-muted">
                Extending books the next available slot and is paid in USDT.
              </p>
              <Button
                size="md"
                variant="ghost"
                onClick={() => setShowExtend(false)}
              >
                Cancel
              </Button>
            </Card>
          ) : (
            <Button full size="lg" onClick={() => setShowExtend(true)}>
              <Plus className="mr-2 size-4" />
              Extend time
            </Button>
          )
        ) : (
          <Button
            full
            size="lg"
            variant="secondary"
            onClick={() => navigate(`/parking/${parkingSpace.id}`)}
          >
            Book this space again
          </Button>
        )}

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

        <Button
          variant="ghost"
          full
          size="lg"
          onClick={() => navigate(`/pass/${reservation.id}`)}
        >
          View parking pass
        </Button>
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
