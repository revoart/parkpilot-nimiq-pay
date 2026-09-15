import { SquareParking } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import {
  DayGrid,
  DurationPicker,
  TimeSlotPicker,
} from '@/components/booking/BookingPickers'
import { AppShell } from '@/components/layout/AppShell'
import { DestinationCard } from '@/components/journey'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
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
import { formatUsdt } from '@/utils/format'

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
  onClick,
  muted = false,
}: {
  label: string
  value: ReactNode
  onClick?: () => void
  muted?: boolean
}) {
  const content = (
    <>
      <span className="text-[15px] text-ink-muted">{label}</span>
      <span
        className={
          muted
            ? 'text-[15px] text-ink-muted'
            : 'text-[15px] font-semibold text-ink'
        }
      >
        {value}
      </span>
    </>
  )

  if (!onClick) {
    return (
      <div className="flex items-center justify-between py-3">{content}</div>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between py-3 text-left active:opacity-70"
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
  }, [id])

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
  const total = (space?.price_usdt ?? 0) * hours

  async function handleContinue() {
    setSubmitError(null)
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
        evmAddress: address,
        startAt: start.toISOString(),
        endAt: end.toISOString(),
        destination,
      })
      void trackEvent('reservation_started', {
        evmAddress: address,
        metadata: { parking_space_id: space.id, amount_usdt: result.amount_usdt },
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
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <AppShell showBack title="Reserve parking">
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      </AppShell>
    )
  }

  if (loadError || !space) {
    return (
      <AppShell showBack title="Reserve parking">
        <EmptyState
          title="Parking not found"
          description={loadError ?? 'This parking space is unavailable.'}
        />
      </AppShell>
    )
  }

  if (days.length === 0) {
    return (
      <AppShell showBack title="Reserve parking">
        <EmptyState
          title="No availability"
          description="This Host hasn't opened any bookable times yet."
        />
      </AppShell>
    )
  }

  const durationLabel =
    durationMinutes >= 60
      ? `${hours} ${hours === 1 ? 'hour' : 'hours'}`
      : `${durationMinutes} min`

  return (
    <AppShell showBack title="Reserve parking">
      <div className="flex min-h-full flex-col">
        <div className="flex-1">
          <div className="mb-6 flex items-center gap-3 rounded-2xl bg-subtle p-4">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-ink">
              <SquareParking className="size-5 text-on-ink" />
            </span>
            <div className="min-w-0">
              <p className="truncate font-bold">{space.title}</p>
              <p className="truncate text-sm text-ink-muted">{space.address}</p>
            </div>
          </div>

          <Row
            label="Date"
            value={dateLong(date)}
            onClick={() => setSheet('date')}
          />
          <Row
            label="Arrival"
            value={time12(startTime)}
            onClick={() => setSheet('arrival')}
          />
          <Row
            label="Departure"
            value={time12(endTime)}
            muted
          />
          <Row
            label="Duration"
            value={durationLabel}
            onClick={() => setSheet('duration')}
          />

          {destination ? (
            <div className="pt-4">
              <DestinationCard
                destination={destination}
                route={route}
                caption="From this parking"
              />
            </div>
          ) : null}

          <div className="h-px bg-line" />

          <div className="pt-4">
            <div className="flex items-center justify-between py-3">
              <span className="text-[15px] text-ink-muted">Parking</span>
              <span className="text-[15px]">
                {formatUsdt(total)} USDT
              </span>
            </div>
            <div className="flex items-center justify-between py-3">
              <span className="text-[15px] text-ink-muted">Service fee</span>
              <span className="text-[15px]">0.00 USDT</span>
            </div>
            <div className="h-px bg-line" />
            <div className="flex items-center justify-between py-3.5">
              <span className="text-[15px] font-bold">Total</span>
              <span className="text-[22px] font-bold tracking-[-0.3px]">
                {formatUsdt(total)} USDT
              </span>
            </div>
          </div>

          <p className="mt-2 text-center text-xs leading-relaxed text-ink-faint">
            Free cancellation before arrival. Payment is USDT on Polygon.
          </p>

          {submitError ? (
            <p className="mt-3 text-sm text-danger">{submitError}</p>
          ) : null}
        </div>

        <div className="sticky bottom-0 -mx-4 mt-4 border-t border-line bg-canvas px-4 pb-3 pt-2.5">
          <Button
            full
            size="lg"
            onClick={() => void handleContinue()}
            loading={submitting || wallet.status === 'connecting'}
            disabled={slots.length === 0}
          >
            Confirm &amp; Pay {formatUsdt(total)} USDT
          </Button>
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
