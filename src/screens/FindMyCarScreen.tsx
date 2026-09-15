import { Footprints, Navigation, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { WalkBadge } from '@/components/journey'
import { AppShell } from '@/components/layout/AppShell'
import { LocationMap } from '@/components/map/LocationMap'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
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
      <AppShell showBack showNav={false} title="Find my car">
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

  return (
    <AppShell showBack title="Find my car">
      <div className="space-y-3">
        <LocationMap
          point={{ lat: car.lat, lng: car.lng }}
          label={car.title}
          className="h-[42vh] w-full overflow-hidden rounded-card border border-line"
        />

        <SwipeToDelete
          label="Clear"
          onDelete={() => {
            clearParkedCar(car.reservationId)
            navigate(-1)
          }}
        >
          <Card className="space-y-2">
            <p className="text-sm font-semibold">{car.title}</p>
            <p className="text-xs text-ink-muted">{car.address}</p>
            {car.note ? (
              <p className="rounded-xl bg-surface p-3 text-xs text-ink-soft">
                {car.note}
              </p>
            ) : null}
            <p className="text-[11px] text-ink-muted">
              Saved {new Date(car.timestamp).toLocaleString()}
            </p>
          </Card>
        </SwipeToDelete>

        {geo.coords ? (
          <Card className="flex items-center gap-3">
            <Footprints className="size-5 text-accent" />
            <WalkBadge route={walkRoute} loading={walkLoading} />
          </Card>
        ) : (
          <Button variant="secondary" onClick={geo.request} loading={geo.loading}>
            Use my location for walking directions
          </Button>
        )}

        {geo.error ? <p className="text-xs text-ink-muted">{geo.error}</p> : null}

        <a
          href={mapsUrl}
          target="_blank"
          rel="noreferrer"
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-accent px-4 py-3.5 text-sm font-semibold text-on-ink"
        >
          <Navigation className="size-4" />
          Navigate to Car
        </a>

        <Button
          variant="ghost"
          onClick={() => {
            clearParkedCar(car.reservationId)
            navigate(-1)
          }}
        >
          <Trash2 className="size-4" />
          Clear saved location
        </Button>
      </div>
    </AppShell>
  )
}
