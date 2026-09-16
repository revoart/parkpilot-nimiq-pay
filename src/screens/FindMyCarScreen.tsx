import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { AppShell } from '@/components/layout/AppShell'
import { LocationMap } from '@/components/map/LocationMap'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Handle } from '@/components/ui/Handle'
import { StatusPill } from '@/components/ui/StatusPill'
import { SwipeToDelete } from '@/components/ui/SwipeToDelete'
import { useGeolocation } from '@/hooks/useGeolocation'
import { useWalkingRoute } from '@/hooks/useWalkingRoute'
import {
  clearParkedCar,
  getCurrentParkedCar,
  getParkedCar,
  type ParkedCar,
} from '@/lib/findmycar/storage'
import { directionsUrl } from '@/lib/navigation'
import { formatDistance, formatWalkTime } from '@/lib/routing'

export function FindMyCarScreen() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const reservationId = params.get('reservation')
  const geo = useGeolocation()

  const [car, setCar] = useState<ParkedCar | null>(null)

  useEffect(() => {
    setCar(reservationId ? getParkedCar(reservationId) : getCurrentParkedCar())
  }, [reservationId])

  // Ask for a fix straight away — the whole point of this screen is the walk
  // back to the car, so the distance should be there without an extra tap.
  useEffect(() => {
    geo.request()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Walking route from wherever the driver is now back to the car.
  const { route: walkRoute, loading: walkLoading } = useWalkingRoute(
    geo.coords,
    car ? { lat: car.lat, lng: car.lng } : null,
  )

  if (!car) {
    return (
      <AppShell showBack showNav={false} title="Find My Car">
        <EmptyState
          title="No saved parking location"
          description="After you park, open your pass and tap “I've parked here” to save the spot."
          action={
            <Button variant="secondary" size="md" onClick={() => navigate('/')}>
              Back to parking
            </Button>
          }
        />
      </AppShell>
    )
  }

  const mapsUrl = directionsUrl({ lat: car.lat, lng: car.lng }, 'walking')
  const walkDistance = walkRoute
    ? formatDistance(walkRoute.distanceMeters)
    : null
  const walkTime = walkRoute
    ? formatWalkTime(walkRoute.durationSeconds)
    : null

  return (
    <AppShell showBack title="Find My Car" bleed>
      <div className="relative h-full w-full">
        <LocationMap
          point={{ lat: car.lat, lng: car.lng }}
          label={car.title}
          className="absolute inset-0 h-full w-full"
        />

        {/* Bottom sheet, kept above Google's required attribution strip. */}
        <div className="sheet-enter absolute inset-x-0 bottom-0 z-10 px-3 pb-7">
          <SwipeToDelete
            label="Clear"
            className="rounded-2xl shadow-[0_8px_24px_rgba(0,0,0,0.07)]"
            onDelete={() => {
              clearParkedCar(car.reservationId)
              navigate(-1)
            }}
          >
            <div className="rounded-2xl border border-line bg-surface-raised p-4">
              <Handle />

              <div className="mt-1 flex items-center justify-between gap-3">
                <StatusPill
                  tone="accent"
                  solid
                  className="uppercase tracking-[0.4px] bg-brand text-on-ink"
                >
                  Parked now
                </StatusPill>

                {walkRoute ? (
                  <StatusPill
                    tone="success"
                    className="uppercase tracking-[0.4px]"
                  >
                    {walkTime} walk
                  </StatusPill>
                ) : walkLoading ? (
                  <span className="text-[11px] font-semibold text-ink-faint">
                    Locating…
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={geo.request}
                    className="text-[11px] font-semibold text-brand"
                  >
                    Use location
                  </button>
                )}
              </div>

              <h2 className="mt-3 text-[22px] font-bold leading-[27px] tracking-[-0.3px]">
                {car.title}
              </h2>
              <p className="mt-1 text-[14px] leading-[20px] text-ink-muted">
                {car.address}
              </p>
              {car.note ? (
                <p className="mt-0.5 text-[12px] text-ink-faint">{car.note}</p>
              ) : null}

              <div className="my-3 h-px bg-line" />

              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-[0.6px] text-ink-muted">
                    Distance
                  </p>
                  <p className="mt-0.5 truncate text-[17px] font-bold text-brand">
                    {walkDistance ?? '—'}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[11px] font-bold uppercase tracking-[0.6px] text-ink-muted">
                    Walk time
                  </p>
                  <p className="mt-0.5 text-[17px] font-bold">
                    {walkTime ?? '—'}
                  </p>
                </div>
              </div>

              <a
                href={mapsUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 flex w-full items-center justify-center rounded-xl bg-brand px-4 py-3.5 text-[15px] font-bold text-on-ink shadow-[0_4px_12px_rgba(76,130,255,0.12)]"
              >
                Open in Maps
              </a>

              {geo.error ? (
                <p className="mt-2 text-[11px] text-ink-muted">{geo.error}</p>
              ) : null}
            </div>
          </SwipeToDelete>
        </div>
      </div>
    </AppShell>
  )
}
