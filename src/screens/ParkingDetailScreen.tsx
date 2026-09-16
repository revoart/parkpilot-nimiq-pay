import {
  Accessibility,
  ArrowLeft,
  Bookmark,
  Car,
  Navigation,
  ShieldAlert,
  ShieldCheck,
  Star,
  Zap,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { NimiqMark } from '@/components/brand/NimiqMark'
import { AppShell } from '@/components/layout/AppShell'
import { JourneySummary } from '@/components/journey'
import { ParkingMap } from '@/components/map/ParkingMap'
import { ListingPhoto } from '@/components/parking/ListingPhoto'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { StateCard } from '@/components/ui/StateCard'
import { StatusPill } from '@/components/ui/StatusPill'
import { UsdEquivalent } from '@/components/ui/UsdEquivalent'
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
import { formatNim } from '@/utils/format'

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
        <div className="absolute inset-0 flex flex-col">
          <div className="relative flex h-[30%] shrink-0 items-center justify-center bg-map">
            <button
              type="button"
              aria-label="Back"
              onClick={() => navigate(-1)}
              className="pointer-events-auto absolute left-3 top-3 z-[1000] flex size-10 items-center justify-center rounded-xl bg-surface-raised/95 shadow-sm shadow-black/5 backdrop-blur-sm"
            >
              <ArrowLeft className="size-5" />
            </button>
            <span
              className="text-[15px] font-semibold text-ink-muted"
              role="status"
              aria-live="polite"
            >
              Loading Map…
            </span>
          </div>

          <div className="no-scrollbar flex-1 overflow-y-auto bg-canvas pb-6">
            <div className="px-4 pt-4">
              <div className="flex gap-2">
                <Skeleton className="h-6 w-24 rounded-full" />
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
              <Skeleton className="mt-3 h-7 w-3/4" />
              <Skeleton className="mt-2.5 h-4 w-1/2" />

              <div className="mt-4 rounded-2xl bg-surface-raised p-4 shadow-[0_4px_12px_rgba(0,0,0,0.04)]">
                <div className="flex items-center gap-3">
                  <Skeleton className="size-8 shrink-0 rounded-full" />
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="ml-auto h-7 w-28 rounded-full" />
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-1.5 flex-1 rounded-full" />
                </div>
              </div>

              <div className="mt-3 grid grid-cols-4 gap-2">
                {[0, 1, 2, 3].map((tile) => (
                  <div
                    key={tile}
                    className="flex flex-col gap-2 rounded-xl bg-surface-raised p-3"
                  >
                    <Skeleton className="size-5 rounded-full" />
                    <Skeleton className="h-3 w-10" />
                  </div>
                ))}
              </div>

              <div className="mt-4 flex items-center gap-3 rounded-2xl bg-surface-raised p-4">
                <Skeleton className="size-8 shrink-0 rounded-full" />
                <Skeleton className="h-4 w-24" />
                <span className="h-px flex-1 border-t border-dashed border-line-strong" />
                <Skeleton className="size-8 shrink-0 rounded-full" />
                <Skeleton className="h-4 w-20" />
              </div>

              <Skeleton className="mt-6 h-4 w-40" />
              <div className="mt-3 rounded-2xl bg-surface-raised p-4 shadow-[0_4px_12px_rgba(0,0,0,0.04)]">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-16" />
                </div>
                <Skeleton className="mt-3 h-4 w-full" />
                <Skeleton className="mt-2 h-4 w-2/3" />
              </div>
            </div>
          </div>
        </div>
      </AppShell>
    )
  }

  if (error || !space) {
    return (
      <AppShell showBack title="Listing Error">
        <div className="flex min-h-full flex-col">
          <div className="h-[30%] shrink-0 bg-map" aria-hidden="true" />
          <div className="flex flex-1 items-center">
            <StateCard
              tone="danger"
              icon={<ShieldAlert className="size-6" />}
              title="Listing unavailable"
              description={
                error ??
                'This parking spot may have been removed or is temporarily unavailable.'
              }
            >
              <Button full size="lg" onClick={() => navigate('/')}>
                Go Back
              </Button>
            </StateCard>
          </div>
        </div>
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
    <AppShell
      bleed
      footer={
        // Kept as a pair: navigating there and reserving it are the same
        // decision, and splitting them across the fold loses that.
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            size="lg"
            className="flex-1"
            onClick={() =>
              navigate(
                `/navigate/${space.id}${destinationQuery(destination)}`,
              )
            }
          >
            <Navigation className="mr-1.5 size-4" />
            Navigate
          </Button>
          <Button
            size="lg"
            className="flex-1"
            onClick={() =>
              navigate(`/reserve/${space.id}${destinationQuery(destination)}`)
            }
          >
            Reserve Spot
          </Button>
        </div>
      }
    >
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

        <div className="no-scrollbar flex-1 overflow-y-auto bg-canvas pb-6">
          <div className="px-4 pt-4">
            <StatusPill
              tone="accent"
              solid
              className="rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.4px]"
            >
              {parkingTypeLabel(space.parking_type)}
            </StatusPill>

            <h1 className="mt-2.5 text-[22px] font-extrabold leading-[27px] tracking-[-0.4px]">
              {space.title}
            </h1>
            <p className="mt-1 text-[14px] leading-5 text-ink-muted">
              {space.address}
            </p>

            <div className="mt-4 flex items-start justify-between gap-4 rounded-2xl bg-surface-raised p-4 shadow-[0_4px_12px_rgba(0,0,0,0.04)]">
              <div className="min-w-0 flex-1">
                {reviews && reviews.count > 0 ? (
                  <p className="flex items-center gap-1.5 text-[14px] leading-none">
                    <Star className="size-4 shrink-0 fill-star text-star" />
                    <span className="font-bold">
                      {reviews.average.toFixed(1)}
                    </span>
                    <span className="text-ink-muted">
                      ({reviews.count} reviews)
                    </span>
                  </p>
                ) : null}

                {confidence !== null ? (
                  <div className="mt-3 flex items-center gap-2">
                    <span className="shrink-0 text-[13px] font-bold text-success">
                      {confidence}% Match
                    </span>
                    <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-success-bg">
                      <span
                        className="block h-full rounded-full bg-success"
                        style={{ width: `${confidence}%` }}
                      />
                    </span>
                  </div>
                ) : null}
              </div>

              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-brand/30 bg-brand/8 py-1.5 pl-2 pr-3">
                <NimiqMark className="size-5" />
                <span className="text-[14px] font-bold leading-none tracking-[-0.2px]">
                  {formatNim(space.price_nim)}/hr NIM
                </span>
                <UsdEquivalent
                  nim={space.price_nim}
                  className="text-[12px] font-medium text-ink-muted"
                />
              </span>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {features.map(({ icon: Icon, label }) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-surface px-3 py-2"
                >
                  <Icon className="size-4 text-brand" />
                  <span className="text-[13px] font-semibold text-ink-soft">
                    {label}
                  </span>
                </span>
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

            {reviews && reviews.reviews.length > 0 ? (
              <div className="mt-6">
                <p className="text-[11px] font-extrabold uppercase tracking-[1.2px] text-ink-faint">
                  Recent stories &amp; reviews
                </p>
                <div className="mt-3 space-y-3">
                  {reviews.reviews.slice(0, 4).map((review) => (
                    <div
                      key={review.id}
                      className="rounded-2xl bg-surface-raised p-4 shadow-[0_4px_12px_rgba(0,0,0,0.04)]"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate text-[15px] font-bold">
                          {review.name}
                        </span>
                        <span className="flex shrink-0 items-center gap-1 text-[13px]">
                          <Star className="size-4 fill-star text-star" />
                          <span className="font-bold">{review.rating}</span>
                          <span className="text-ink-faint">
                            {reviewDate(review.createdAt)}
                          </span>
                        </span>
                      </div>
                      {review.comment ? (
                        <p className="mt-2 text-[14px] leading-5 text-ink-muted">
                          {review.comment}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-6 border-t border-line pt-4">
              <p className="text-[15px] font-bold">About this parking</p>
              <p className="mt-1.5 text-[14px] leading-5 text-ink-muted">
                {space.description ??
                  'Reserve in advance and pay with NIM through Nimiq Pay. Your parking pass appears in Bookings once payment is confirmed on-chain.'}
              </p>
            </div>

          </div>
        </div>
      </div>
    </AppShell>
  )
}
