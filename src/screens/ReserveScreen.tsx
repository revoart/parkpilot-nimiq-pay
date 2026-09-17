import {
  CalendarDays,
  ChevronDown,
  Clock,
  Hourglass,
  ShieldAlert,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { NimiqMark } from '@/components/brand/NimiqMark'
import {
  DayGrid,
  DurationPicker,
  TimeSlotPicker,
} from '@/components/booking/BookingPickers'
import { AppShell } from '@/components/layout/AppShell'
import { DestinationCard } from '@/components/journey'
import { ListingPhoto } from '@/components/parking/ListingPhoto'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { StateCard } from '@/components/ui/StateCard'
import { UsdEquivalent } from '@/components/ui/UsdEquivalent'
import { useDestination } from '@/hooks/useDestination'
import { useWalkingRoute } from '@/hooks/useWalkingRoute'
import { useWallet } from '@/hooks/useWallet'
import { trackEvent } from '@/lib/analytics/events'
import {
  availableDays,
  getAvailability,
  getParkingSpace,
  hasAnyAvailability,
  slotStarts,
  windowForTime,
  type DayAvailability,
} from '@/lib/parking'
import { createReservation } from '@/lib/reservations'
import type { ParkingSpace } from '@/types'
import { cn } from '@/utils/cn'
import { formatNim } from '@/utils/format'

function toMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map(Number)
  return hours * 60 + (minutes || 0)
}

function fromMinutes(total: number): string {
  const hours = Math.floor(total / 60)
  const minutes = total % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function time12(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return `${hour}:${String(m).padStart(2, '0')} ${period}`
}

function dateLong(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

const FREE_WINDOW = [{ start: '00:00', end: '24:00' }]

type SheetKind = 'date' | 'arrival' | 'duration' | null

function Row({
  label,
  value,
  icon: Icon,
  onClick,
  muted = false,
  valueClassName,
}: {
  label: string
  value: ReactNode
  icon: LucideIcon
  onClick?: () => void
  muted?: boolean
  valueClassName?: string
}) {
  const content = (
    <>
      <span className="flex min-w-0 items-center gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-surface">
          <Icon className="size-4 text-brand" />
        </span>
        <span className="truncate text-[15px] text-ink-muted">{label}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1">
        <span
          className={cn(
            muted ? 'text-[15px] text-ink-muted' : 'text-[15px] font-bold text-ink',
            valueClassName,
          )}
        >
          {value}
        </span>
        {onClick ? <ChevronDown className="size-4 text-ink-muted" /> : null}
      </span>
    </>
  )

  const base =
    'flex w-full items-center justify-between gap-3 rounded-2xl bg-surface-raised px-3.5 py-3 shadow-[0_4px_12px_rgba(0,0,0,0.04)]'

  if (!onClick) {
    return <div className={base}>{content}</div>
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(base, 'text-left active:opacity-70')}
    >
      {content}
    </button>
  )
}

export function ReserveScreen() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const wallet = useWallet()

  const [space, setSpace] = useState<ParkingSpace | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  const destination = useDestination()
  const { route } = useWalkingRoute(
    space ? { lat: space.latitude, lng: space.longitude } : null,
    destination ? { lat: destination.lat, lng: destination.lng } : null,
  )

  const [days, setDays] = useState<DayAvailability[]>([])
  const [freeMode, setFreeMode] = useState(false)
  const [date, setDate] = useState('')
  const [startTime, setStartTime] = useState('18:00')
  const [durationMinutes, setDurationMinutes] = useState(180)
  const [sheet, setSheet] = useState<SheetKind>(null)

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitFailed, setSubmitFailed] = useState(false)

  useEffect(() => {
    let active = true
    if (!id) return
    setLoading(true)

    Promise.all([getParkingSpace(id), getAvailability(id)])
      .then(([result, availability]) => {
        if (!active) return
        setSpace(result)

        const free = !hasAnyAvailability(availability)
        setFreeMode(free)

        if (free) {
          const list: DayAvailability[] = []
          const today = new Date()
          today.setHours(0, 0, 0, 0)
          for (let index = 0; index < 30; index += 1) {
            const day = new Date(today.getTime() + index * 86_400_000)
            const offset = day.getTimezoneOffset()
            const iso = new Date(day.getTime() - offset * 60_000)
              .toISOString()
              .slice(0, 10)
            list.push({ date: iso, windows: FREE_WINDOW })
          }
          setDays(list)
          setDate(list[0]?.date ?? '')
        } else {
          const list = availableDays(availability, 30)
          setDays(list)
          setDate(list[0]?.date ?? '')
        }
      })
      .catch((err: unknown) => {
        if (active) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load.')
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [id, attempt])

  const windows = useMemo<{ start: string; end: string }[]>(() => {
    if (!date) return []
    if (freeMode) return FREE_WINDOW
    return days.find((day) => day.date === date)?.windows ?? []
  }, [date, days, freeMode])

  const slots = useMemo(
    () => windows.flatMap((w) => slotStarts(w)),
    [windows],
  )

  useEffect(() => {
    if (slots.length === 0) return
    if (!slots.includes(startTime)) setStartTime(slots[0])
  }, [slots, startTime])

  const activeWindow = useMemo(
    () => windowForTime(windows, startTime),
    [windows, startTime],
  )

  const maxMinutes = useMemo(() => {
    if (!activeWindow) return 24 * 60
    return Math.max(30, toMinutes(activeWindow.end) - toMinutes(startTime))
  }, [activeWindow, startTime])

  useEffect(() => {
    setDurationMinutes((current) => Math.min(Math.max(30, current), maxMinutes))
  }, [maxMinutes])

  const endTime = fromMinutes(toMinutes(startTime) + durationMinutes)
  const hours = durationMinutes / 60
  const total = (space?.price_nim ?? 0) * hours

  async function handleContinue() {
    setSubmitError(null)
    setSubmitFailed(false)
    if (!space || !date || slots.length === 0) {
      setSubmitError('Choose an available date and time.')
      return
    }

    let address = wallet.address
    if (!address) {
      await wallet.connect()
      address = wallet.address
    }
    if (!address) {
      setSubmitError('Connect your wallet to reserve parking.')
      return
    }

    // NIM is paid from the driver's Nimiq account, which is the account that
    // signed in — the server records it as the reservation's payer.

    const start = new Date(`${date}T${startTime}:00`)
    const end = new Date(start.getTime() + durationMinutes * 60_000)
    if (start.getTime() < Date.now() - 60_000) {
      setSubmitError('Pick a start time in the future.')
      return
    }

    setSubmitting(true)
    try {
      const result = await createReservation({
        parkingSpaceId: space.id,
        nimiqAddress: address,
        startAt: start.toISOString(),
        endAt: end.toISOString(),
        destination,
      })
      void trackEvent('reservation_started', {
        nimiqAddress: address,
        metadata: { parking_space_id: space.id, amount_nim: result.amount_nim },
      })
      // Free listings are already confirmed — no payment step.
      if (result.free) {
        navigate(`/pass/${result.reservation_id}`, { replace: true })
      } else {
        navigate(`/payment/${result.reservation_id}`)
      }
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Could not create the reservation.',
      )
      setSubmitFailed(true)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <AppShell showBack title="Reserve Parking">
        <div className="space-y-3">
          <div className="flex items-center gap-3 rounded-2xl bg-surface-raised p-3 shadow-[0_4px_12px_rgba(0,0,0,0.04)]">
            <Skeleton className="size-14 shrink-0 rounded-xl" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>

          <Skeleton className="h-3 w-40" />

          <div className="space-y-2.5">
            {[0, 1, 2, 3].map((row) => (
              <div
                key={row}
                className="flex items-center justify-between gap-3 rounded-2xl bg-surface-raised px-3.5 py-3 shadow-[0_4px_12px_rgba(0,0,0,0.04)]"
              >
                <div className="flex items-center gap-3">
                  <Skeleton className="size-8 shrink-0 rounded-xl" />
                  <Skeleton className="h-4 w-28" />
                </div>
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>

          <div className="rounded-2xl bg-surface-raised p-4 shadow-[0_4px_12px_rgba(0,0,0,0.04)]">
            <Skeleton className="h-3 w-48" />
            <div className="mt-3 flex items-center justify-between">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-4 w-20" />
            </div>
            <div className="mt-3 flex items-center justify-between">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-16" />
            </div>
            <div className="my-2 h-px bg-line" />
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-6 w-28" />
            </div>
          </div>

          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
      </AppShell>
    )
  }

  if (loadError || !space) {
    return (
      <AppShell showBack title="Reserve Parking">
        <div className="flex min-h-full items-center">
          <StateCard
            tone="danger"
            icon={<ShieldAlert className="size-6" />}
            title="Listing unavailable"
            description={loadError ?? 'This parking space is unavailable.'}
          >
            <Button
              full
              size="lg"
              onClick={() => setAttempt((current) => current + 1)}
            >
              Try Again
            </Button>
            <Button
              full
              size="lg"
              variant="secondary"
              onClick={() => navigate(-1)}
            >
              Go Back
            </Button>
          </StateCard>
        </div>
      </AppShell>
    )
  }

  if (days.length === 0) {
    return (
      <AppShell showBack title="Reserve Parking">
        <EmptyState
          title="No availability"
          description="This Host hasn't opened any bookable times yet."
        />
      </AppShell>
    )
  }

  if (submitFailed) {
    return (
      <AppShell showBack title="Reserve Parking">
        <div className="flex min-h-full items-center">
          <StateCard
            tone="danger"
            icon={<ShieldAlert className="size-6" />}
            title="Reservation failed"
            description={
              submitError ??
              "We couldn't process your reservation. The spot may no longer be available."
            }
          >
            <Button
              full
              size="lg"
              onClick={() => void handleContinue()}
              loading={submitting}
            >
              Try Again
            </Button>
            <Button
              full
              size="lg"
              variant="secondary"
              onClick={() => navigate(-1)}
            >
              Go Back
            </Button>
          </StateCard>
        </div>
      </AppShell>
    )
  }

  const durationLabel =
    durationMinutes >= 60
      ? `${hours} ${hours === 1 ? 'hour' : 'hours'}`
      : `${durationMinutes} min`

  const busy = submitting || wallet.status === 'connecting'

  return (
    <AppShell
      showBack
      title="Reserve Parking"
      footer={
        <Button
          full
          size="lg"
          className="gap-2"
          onClick={() => void handleContinue()}
          loading={busy}
          disabled={slots.length === 0}
        >
          {!busy ? <NimiqMark className="size-4" /> : null}
          Confirm &amp; Pay {formatNim(total)} NIM
        </Button>
      }
    >
      <div className="flex min-h-full flex-col">
        <div className="flex-1">
          <div className="flex items-center gap-3 rounded-2xl bg-surface-raised p-3 shadow-[0_4px_12px_rgba(0,0,0,0.04)]">
            <ListingPhoto
              imageUrl={space.image_url}
              title={space.title}
              className="size-14 shrink-0 rounded-xl"
            />
            <div className="min-w-0">
              <p className="truncate text-[16px] font-bold tracking-[-0.2px]">
                {space.title}
              </p>
              <p className="truncate text-[13px] text-ink-muted">
                {space.address}
              </p>
            </div>
          </div>

          <p className="mb-2 mt-6 text-[11px] font-extrabold uppercase tracking-[1.2px] text-ink-faint">
            Booking parameters
          </p>
          <div className="space-y-2.5">
            <Row
              icon={CalendarDays}
              label="Booking Date"
              value={dateLong(date)}
              onClick={() => setSheet('date')}
            />
            <Row
              icon={Clock}
              label="Arrival Time"
              value={time12(startTime)}
              onClick={() => setSheet('arrival')}
            />
            <Row
              icon={Clock}
              label="Departure Time"
              value={time12(endTime)}
              muted
            />
            <Row
              icon={Hourglass}
              label="Total Duration"
              value={durationLabel}
              valueClassName="text-brand"
              onClick={() => setSheet('duration')}
            />
          </div>

          <div className="mt-4 rounded-2xl bg-surface-raised p-4 shadow-[0_4px_12px_rgba(0,0,0,0.04)]">
            <p className="text-[11px] font-extrabold uppercase tracking-[1.2px] text-ink-faint">
              Cost breakdown (on-chain accrued)
            </p>
            <div className="mt-3 flex items-center justify-between py-1.5">
              <span className="text-[14px] text-ink-muted">
                Hourly rate ({formatNim(space.price_nim)} NIM × {hours})
              </span>
              <span className="text-[14px] font-semibold">
                {formatNim(total)} NIM
              </span>
            </div>
            <div className="flex items-center justify-between py-1.5">
              <span className="text-[14px] text-ink-muted">Platform fee</span>
              <span className="text-[14px] font-semibold">0.00 NIM</span>
            </div>
            <div className="my-2 h-px bg-line" />
            <div className="flex items-center justify-between">
              <span className="text-[15px] font-bold">Total amount</span>
              <span className="text-right">
                <span className="block text-[20px] font-extrabold tracking-[-0.3px] text-brand">
                  {formatNim(total)} NIM
                </span>
                <UsdEquivalent
                  nim={total}
                  className="block text-[12px] font-semibold text-ink-faint"
                />
              </span>
            </div>
          </div>

          {destination ? (
            <div className="pt-4">
              <DestinationCard
                destination={destination}
                route={route}
                caption="From this parking"
              />
            </div>
          ) : null}

          <p className="mt-4 text-center text-xs leading-relaxed text-ink-faint">
            Free cancellation before arrival. Payment is NIM on the Nimiq
            network.
          </p>

          {submitError ? (
            <p className="mt-3 text-sm text-danger">{submitError}</p>
          ) : null}
        </div>
      </div>

      <BottomSheet
        open={sheet === 'date'}
        title="Select date"
        onClose={() => setSheet(null)}
      >
        <DayGrid
          days={days}
          value={date}
          onChange={(next) => {
            setDate(next)
            setSheet(null)
          }}
        />
      </BottomSheet>

      <BottomSheet
        open={sheet === 'arrival'}
        title="Arrival time"
        onClose={() => setSheet(null)}
      >
        <TimeSlotPicker
          slots={slots}
          value={startTime}
          onChange={(next) => {
            setStartTime(next)
            setSheet(null)
          }}
        />
      </BottomSheet>

      <BottomSheet
        open={sheet === 'duration'}
        title="Duration"
        onClose={() => setSheet(null)}
      >
        <DurationPicker
          value={durationMinutes}
          onChange={setDurationMinutes}
          maxMinutes={maxMinutes}
        />
      </BottomSheet>
    </AppShell>
  )
}
