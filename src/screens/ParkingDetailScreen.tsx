import {
  Accessibility,
  ArrowLeft,
  Bookmark,
  Car,
  Navigation,
  ShieldCheck,
  Star,
  Zap,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { AppShell } from '@/components/layout/AppShell'
import { JourneySummary } from '@/components/journey'
import { ParkingMap } from '@/components/map/ParkingMap'
import { ListingPhoto } from '@/components/parking/ListingPhoto'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { StatusPill } from '@/components/ui/StatusPill'
import { destinationQuery, useDestination } from '@/hooks/useDestination'
import { useDrivingRoute } from '@/hooks/useDrivingRoute'
import { useGeolocation } from '@/hooks/useGeolocation'
import { useWalkingRoute } from '@/hooks/useWalkingRoute'
import {
  getParkingReviews,
  getParkingSpace,
  parkingTypeLabel,
  type ReviewSummary,
} from '@/lib/parking'
import { isSaved, toggleSaved } from '@/lib/saved'
import type { ParkingSpace } from '@/types'
import { cn } from '@/utils/cn'
import { formatUsdt } from '@/utils/format'

function reviewDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

export function ParkingDetailScreen() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [space, setSpace] = useState<ParkingSpace | null>(null)
  const [reviews, setReviews] = useState<ReviewSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const destination = useDestination()
  const geo = useGeolocation()

  const parkingPoint = space
    ? { lat: space.latitude, lng: space.longitude }
    : null
  const destinationPoint = destination
    ? { lat: destination.lat, lng: destination.lng }
    : null

  // One fix is enough for a drive estimate here; live tracking belongs to the
  // navigation screen.
  useEffect(() => {
    geo.request()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const { route: driveRoute, loading: driveLoading } = useDrivingRoute(
    geo.coords,
    parkingPoint,
  )

  const { route, loading: walkLoading } = useWalkingRoute(
    parkingPoint,
    destinationPoint,
  )

  useEffect(() => {
    let active = true
    if (!id) return

    setLoading(true)
    Promise.all([getParkingSpace(id), getParkingReviews(id)])
      .then(([result, reviewResult]) => {
        if (!active) return
        setSpace(result)
        setReviews(reviewResult)
        if (result) setSaved(isSaved(result.id))
      })
      .catch((err: unknown) => {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to load parking.')
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [id])

  if (loading) {
    return (
      <AppShell bleed>
        <div className="space-y-3 p-4">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </AppShell>
    )
  }

  if (error || !space) {
    return (
      <AppShell showBack title="Parking">
        <EmptyState
          title="Parking not found"
          description={error ?? 'This parking space is unavailable.'}
          action={
            <Button variant="secondary" size="md" onClick={() => navigate('/')}>
              Back to parking
            </Button>
          }
        />
      </AppShell>
    )
  }

  const features = [
    space.covered ? { icon: Car, label: 'Covered' } : null,
    { icon: ShieldCheck, label: 'Secure' },
    space.ev_charging ? { icon: Zap, label: 'EV Ready' } : null,
    space.accessible
      ? { icon: Accessibility, label: 'Accessible' }
      : { icon: Car, label: 'Open lot' },
  ].filter(Boolean) as { icon: typeof Car; label: string }[]

  const confidence = reviews?.count
    ? Math.round((reviews.average / 5) * 100)
    : null

  return (
    <AppShell bleed>
      <div className="absolute inset-0 flex flex-col">
        <div className="relative h-[30%] shrink-0">
          <ParkingMap
            spaces={[space]}
            center={{ lat: space.latitude, lng: space.longitude }}
            destination={
              destination
                ? { lat: destination.lat, lng: destination.lng }
                : null
            }
            walkPath={route?.path ?? null}
            // Keeps the destination marker clear of the inset photo and of
            // Google's attribution strip along the bottom edge.
            bottomInset={96}
            className="h-full w-full"
          />
          <div className="pointer-events-none absolute inset-x-0 top-0 z-[1000] flex items-center justify-between p-3">
            <button
              type="button"
              aria-label="Back"
              onClick={() => navigate(-1)}
              className="pointer-events-auto flex size-10 items-center justify-center rounded-xl bg-surface-raised/95 shadow-sm shadow-black/5 backdrop-blur-sm"
            >
              <ArrowLeft className="size-5" />
            </button>
            <button
              type="button"
              aria-label={saved ? 'Remove from saved' : 'Save parking'}
              onClick={() => setSaved(toggleSaved(space))}
              className="pointer-events-auto flex size-10 items-center justify-center rounded-xl bg-surface-raised/95 shadow-sm shadow-black/5 backdrop-blur-sm"
            >
              <Bookmark
                className={cn('size-5', saved ? 'fill-ink text-ink' : 'text-ink')}
              />
            </button>
          </div>

          {/* The listing's photo, inset over the map. Raised clear of the
              Google wordmark so attribution stays visible. */}
          <div className="pointer-events-none absolute bottom-9 left-3 z-[1000]">
            <ListingPhoto
              imageUrl={space.image_url}
              title={space.title}
              className="h-16 w-24 rounded-xl ring-2 ring-surface-raised shadow-md shadow-black/20"
            />
          </div>
        </div>

        <div className="no-scrollbar flex-1 overflow-y-auto bg-canvas pb-28">
          <div className="px-4 pt-4">
            <div className="flex items-start justify-between gap-3">
              <h1 className="text-[19px] font-bold tracking-[-0.4px]">
                {space.title}
              </h1>
              <div className="shrink-0 text-right">
                <p className="text-[22px] font-bold leading-none tracking-[-0.5px]">
                  {formatUsdt(space.price_usdt)}
                </p>
                <p className="mt-0.5 text-xs text-ink-muted">USDT / hr</p>
              </div>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusPill>{parkingTypeLabel(space.parking_type)}</StatusPill>
              <span className="text-[13px] text-ink-muted">{space.address}</span>
            </div>

            {reviews && reviews.count > 0 ? (
              <div className="mt-2.5 flex items-center gap-2 text-[13px]">
                <Star className="size-4 fill-star text-star" />
                <span className="font-bold">{reviews.average.toFixed(1)}</span>
                <span className="text-ink-muted">({reviews.count})</span>
              </div>
            ) : null}

            {confidence !== null ? (
              <div className="mt-3 flex items-center gap-3.5 rounded-2xl bg-success-bg/60 px-3.5 py-3">
                <div>
                  <p className="text-[22px] font-bold leading-none tracking-[-0.4px] text-success">
                    {confidence}%
                  </p>
                  <p className="mt-0.5 text-[11px] font-semibold text-success">
                    Parking confidence
                  </p>
                </div>
                <div className="flex-1">
                  <div className="h-1.5 overflow-hidden rounded-full bg-success-bg">
                    <div
                      className="h-full rounded-full bg-success"
                      style={{ width: `${confidence}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-ink-muted">
                    Based on {reviews?.count} driver reviews
                  </p>
                </div>
              </div>
            ) : null}

            <div className="mt-3 flex gap-2">
              {features.map(({ icon: Icon, label }) => (
                <div
                  key={label}
                  className="flex flex-1 flex-col items-center gap-1 rounded-xl bg-surface py-2.5"
                >
                  <Icon className="size-4 text-ink-soft" />
                  <span className="text-[10px] font-semibold text-ink-muted">
                    {label}
                  </span>
                </div>
              ))}
            </div>

            {/* The drive leg needs no destination, so it is always real. The
                walk leg is only shown when we actually have somewhere to walk
                to — otherwise we ask, rather than inventing a destination. */}
            <div className="mt-4 space-y-2">
              <JourneySummary
                driveRoute={driveRoute}
                driveLoading={driveLoading}
                walkRoute={destination ? route : null}
                walkLoading={destination ? walkLoading : false}
              />
              {!destination ? (
                <Button
                  variant="secondary"
                  size="md"
                  full
                  onClick={() => navigate('/search')}
                >
                  Choose Destination
                </Button>
              ) : null}
            </div>

            <div className="mt-4 border-t border-line pt-4">
              <p className="text-[14px] font-bold">About this parking</p>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
                {space.description ??
                  'Reserve in advance and pay with USDT through Nimiq Pay. Your parking pass appears in Bookings once payment is confirmed on-chain.'}
              </p>
            </div>

            {reviews && reviews.reviews.length > 0 ? (
              <div className="mt-4 border-t border-line pt-4">
                <p className="text-[14px] font-bold">Reviews</p>
                <div className="mt-2.5 space-y-3">
                  {reviews.reviews.slice(0, 4).map((review) => (
                    <div key={review.id}>
                      <div className="mb-1.5 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="flex size-7 items-center justify-center rounded-full bg-surface text-[10px] font-bold text-ink-soft">
                            {review.name.charAt(0)}
                          </span>
                          <span className="text-sm font-semibold">
                            {review.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-0.5">
                          {Array.from({ length: review.rating }).map((_, i) => (
                            <Star
                              key={i}
                              className="size-3 fill-star text-star"
                            />
                          ))}
                          <span className="ml-1 text-xs text-ink-faint">
                            {reviewDate(review.createdAt)}
                          </span>
                        </div>
                      </div>
                      {review.comment ? (
                        <p className="text-[13px] text-ink-muted">
                          {review.comment}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 z-[1000] border-t border-line bg-surface-raised px-4 pb-3 pt-2.5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[19px] font-bold leading-none tracking-[-0.3px]">
              {formatUsdt(space.price_usdt)}
              <span className="ml-1 text-[11px] font-medium text-ink-muted">
                /hr USDT
              </span>
            </p>
            <button
              type="button"
              onClick={() => navigate('/search')}
              className="text-[12px] font-semibold text-ink-muted"
            >
              View other options
            </button>
          </div>

          <div className="mt-2.5 flex items-center gap-2">
            <Button
              variant="secondary"
              size="lg"
              className="flex-1"
              onClick={() =>
                navigate(`/navigate/${space.id}${destinationQuery(destination)}`)
              }
            >
              <Navigation className="mr-1.5 size-4" />
              Navigate
            </Button>
            <Button
              size="lg"
              className="flex-[1.4]"
              onClick={() =>
                navigate(`/reserve/${space.id}${destinationQuery(destination)}`)
              }
            >
              Reserve parking
            </Button>
          </div>
        </div>
      </div>
    </AppShell>
  )
}
