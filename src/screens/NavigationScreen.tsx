import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Car,
  CornerUpLeft,
  CornerUpRight,
  Flag,
  Footprints,
  LocateFixed,
  MapPin,
  Merge,
  Navigation,
  RotateCcw,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState, type ComponentType } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'

import { GoogleMap } from '@/components/map/GoogleMap'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { useDestination } from '@/hooks/useDestination'
import { useNavigation, type NavigationPhase } from '@/hooks/useNavigation'
import { useTheme } from '@/hooks/useTheme'
import { useWalkingRoute } from '@/hooks/useWalkingRoute'
import { getParkingSpace } from '@/lib/parking'
import { formatArrivalClock, formatDistance, formatDuration } from '@/lib/routing'
import type { ParkingSpace } from '@/types'
import { cn } from '@/utils/cn'

/**
 * In-app navigation: ParkPilot drives you to the parking space, then walks you
 * to your actual destination — without handing off to another app.
 *
 * The bottom card deliberately stops short of the viewport edge so Google's
 * required attribution stays visible underneath it.
 */
type Leg = 'drive' | 'walk'

function maneuverIcon(maneuver: string): ComponentType<{ className?: string }> {
  const value = maneuver.toUpperCase()
  if (value.includes('UTURN')) return RotateCcw
  if (value.includes('ROUNDABOUT')) return RotateCcw
  if (value.includes('SHARP_LEFT') || value.includes('FORK_LEFT')) return CornerUpLeft
  if (value.includes('SHARP_RIGHT') || value.includes('FORK_RIGHT')) return CornerUpRight
  if (value.includes('LEFT')) return ArrowLeft
  if (value.includes('RIGHT')) return ArrowRight
  if (value.includes('MERGE') || value.includes('RAMP')) return Merge
  if (value.includes('ARRIVE')) return Flag
  if (value.includes('DEPART')) return Navigation
  return ArrowUp
}

function isTerminal(phase: NavigationPhase): boolean {
  return phase === 'arrived' || phase === 'destination-arrived'
}

export function NavigationScreen() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const destination = useDestination()
  const { theme } = useTheme()

  const [space, setSpace] = useState<ParkingSpace | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  // `?leg=walk` starts straight on the walking stage (from the pass/session).
  const [leg, setLeg] = useState<Leg>(() =>
    params.get('leg') === 'walk' ? 'walk' : 'drive',
  )
  const [follow, setFollow] = useState(true)

  const parking = useMemo(
    () => (space ? { lat: space.latitude, lng: space.longitude } : null),
    [space],
  )
  const destinationPoint = useMemo(
    () =>
      destination ? { lat: destination.lat, lng: destination.lng } : null,
    [destination],
  )

  const nav = useNavigation({
    parking,
    destination: destinationPoint,
    leg,
    enabled: !loading && Boolean(space),
  })

  // Walk summary is needed for the "you've arrived, now walk" hand-off.
  const { route: walkSummary } = useWalkingRoute(parking, destinationPoint)

  useEffect(() => {
    let active = true
    if (!id) return

    setLoading(true)
    getParkingSpace(id)
      .then((result) => {
        if (!active) return
        setSpace(result)
        if (!result) setLoadError('This parking space is unavailable.')
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

  const points = useMemo(
    () =>
      space
        ? [
            {
              id: space.id,
              lat: space.latitude,
              lng: space.longitude,
              variant: 'pin' as const,
              label: 'P',
            },
          ]
        : [],
    [space],
  )

  if (loading) {
    return (
      <div className="absolute inset-0 flex flex-col gap-3 p-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="flex-1 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }

  if (loadError || !space) {
    return (
      <EmptyState
        title="Parking not found"
        description={loadError ?? 'This parking space is unavailable.'}
        action={
          <Button variant="secondary" size="md" onClick={() => navigate('/')}>
            Back to parking
          </Button>
        }
      />
    )
  }

  const ManeuverIcon = maneuverIcon(nav.maneuver)
  const arrived = nav.phase === 'arrived'
  const destinationArrived = nav.phase === 'destination-arrived'
  const locationBlocked = nav.phase === 'location-denied'
  const routeFailed = nav.phase === 'route-error'
  const liveUpdatesDown =
    nav.locationStatus === 'unavailable' || nav.locationStatus === 'timeout'

  const walkTime = walkSummary ? formatDuration(walkSummary.durationSeconds) : null
  const walkDistance = walkSummary
    ? formatDistance(walkSummary.distanceMeters)
    : null

  // A near-black route disappears on the dark map style, so the driving line
  // inverts with the theme.
  const routeColor =
    leg === 'walk'
      ? theme === 'dark'
        ? '#60A5FA'
        : '#2563EB'
      : theme === 'dark'
        ? '#E9E9EC'
        : '#0F0F0F'

  return (
    <div className="absolute inset-0 overflow-hidden bg-canvas">
      <GoogleMap
        className="h-full w-full"
        points={points}
        me={nav.position}
        destination={destinationPoint}
        routePath={nav.route?.path ?? null}
        routeColor={routeColor}
        routeDashed={leg === 'walk'}
        heading={nav.heading}
        follow={follow && nav.isActive}
        followZoom={leg === 'drive' ? 17 : 18}
        meVariant="arrow"
        showRecenter={false}
        interactive
        onDragStart={() => setFollow(false)}
        bottomInset={210}
      />

      {/* --- Top: the maneuver ------------------------------------------------ */}
      <div className="pointer-events-none absolute inset-x-3 top-3 z-[1000] space-y-2">
        <div className="pointer-events-auto flex items-stretch gap-2">
          <button
            type="button"
            aria-label="Exit navigation"
            onClick={() => navigate(-1)}
            className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-surface-raised/95 shadow-sm shadow-black/10 backdrop-blur-sm"
          >
            <X className="size-5" />
          </button>

          <div className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl bg-ink px-3.5 py-2.5 text-on-ink shadow-sm shadow-black/20">
            <ManeuverIcon className="size-7 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold uppercase tracking-[1px] opacity-70">
                {arrived
                  ? 'Arrived'
                  : destinationArrived
                    ? 'Arrived'
                    : nav.metersToManeuver > 0
                      ? `${formatDistance(nav.metersToManeuver)}`
                      : 'Following route'}
              </p>
              <p className="truncate text-[15px] font-bold leading-tight">
                {nav.instruction ??
                  (leg === 'drive'
                    ? 'Head to your parking space'
                    : 'Walk to your destination')}
              </p>
            </div>
          </div>
        </div>

        {nav.nextInstruction ? (
          <p className="pointer-events-auto ml-13 truncate rounded-xl bg-surface-raised/95 px-3 py-1.5 text-[12px] font-medium text-ink-muted shadow-sm shadow-black/5 backdrop-blur-sm">
            Then {nav.nextInstruction}
          </p>
        ) : null}
      </div>

      {/* --- Recenter / resume ------------------------------------------------ */}
      <div className="absolute right-3 top-24 z-[1000] flex flex-col gap-2">
        <button
          type="button"
          aria-label={follow ? 'Following your location' : 'Recenter on me'}
          onClick={() => setFollow(true)}
          className={cn(
            'flex size-11 items-center justify-center rounded-2xl shadow-sm shadow-black/10 backdrop-blur-sm',
            follow ? 'bg-ink text-on-ink' : 'bg-surface-raised/95',
          )}
        >
          <LocateFixed className="size-5" />
        </button>
      </div>

      {!follow && nav.isActive ? (
        <button
          type="button"
          onClick={() => setFollow(true)}
          className="absolute inset-x-3 top-44 z-[1000] rounded-xl bg-surface-raised/95 py-2 text-[12px] font-bold shadow-sm shadow-black/10 backdrop-blur-sm"
        >
          Resume following
        </button>
      ) : null}

      {/* --- Bottom: live ETA. Stops short of the Google wordmark strip. ----- */}
      <div className="absolute inset-x-3 bottom-9 z-[1000] space-y-2">
        {liveUpdatesDown ? (
          <p className="rounded-xl bg-warning-bg px-3 py-2 text-[11px] font-semibold text-warning">
            Live location is unavailable — showing the last known route.
          </p>
        ) : null}

        {locationBlocked ? (
          <div className="rounded-2xl bg-surface-raised p-3 shadow-sm shadow-black/10">
            <p className="text-[13px] font-bold">
              Location access is needed for live navigation.
            </p>
            <p className="mt-0.5 text-[12px] text-ink-muted">
              {nav.locationError}
            </p>
            <Button
              full
              size="md"
              className="mt-2.5"
              onClick={() => window.location.reload()}
            >
              Enable Location
            </Button>
          </div>
        ) : null}

        {routeFailed ? (
          <div className="rounded-2xl bg-surface-raised p-3 shadow-sm shadow-black/10">
            <p className="text-[13px] font-bold">Route unavailable</p>
            <p className="mt-0.5 text-[12px] text-ink-muted">
              {nav.routeError ?? 'We could not calculate a route just now.'}
            </p>
            <Button
              full
              size="md"
              className="mt-2.5"
              onClick={() => nav.recalculate()}
            >
              Try again
            </Button>
          </div>
        ) : null}

        {arrived ? (
          <div className="rounded-2xl bg-surface-raised p-4 shadow-sm shadow-black/10">
            <p className="flex items-center gap-2 text-[17px] font-bold">
              <Flag className="size-5 text-success" />
              You&apos;ve arrived
            </p>
            <p className="mt-0.5 text-[13px] text-ink-muted">
              Parked at {space.title}
            </p>

            {destination ? (
              <>
                <div className="mt-3 flex items-center gap-2.5 rounded-xl bg-surface px-3 py-2.5">
                  <Footprints className="size-4 shrink-0 text-ink-soft" />
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
                    {walkTime ?? '—'} walk to {destination.name}
                  </span>
                  <span className="shrink-0 text-[12px] font-medium text-ink-muted">
                    {walkDistance ?? ''}
                  </span>
                </div>
                <Button
                  full
                  size="lg"
                  className="mt-3"
                  onClick={() => {
                    setLeg('walk')
                    setFollow(true)
                  }}
                >
                  Start Walking
                </Button>
              </>
            ) : (
              <Button
                full
                size="lg"
                className="mt-3"
                onClick={() => navigate(`/pass/${space.id}`)}
              >
                View parking pass
              </Button>
            )}
          </div>
        ) : destinationArrived ? (
          <div className="rounded-2xl bg-surface-raised p-4 shadow-sm shadow-black/10">
            <p className="flex items-center gap-2 text-[17px] font-bold">
              <Flag className="size-5 text-success" />
              You&apos;ve arrived
            </p>
            <p className="mt-0.5 text-[13px] text-ink-muted">
              {destination?.name ?? 'Your destination'}
            </p>
            <Button
              full
              size="lg"
              className="mt-3"
              onClick={() => navigate('/')}
            >
              Done
            </Button>
          </div>
        ) : (
          <div className="rounded-2xl bg-surface-raised p-3.5 shadow-sm shadow-black/10">
            <div className="flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface">
                {leg === 'drive' ? (
                  <Car className="size-5 text-ink" />
                ) : (
                  <Footprints className="size-5 text-ink" />
                )}
              </span>

              <div className="min-w-0 flex-1">
                <p className="text-[22px] font-bold leading-none tracking-[-0.5px]">
                  {nav.etaSeconds !== null
                    ? formatDuration(nav.etaSeconds)
                    : '—'}
                </p>
                <p className="mt-1 truncate text-[12px] font-medium text-ink-muted">
                  {formatDistance(nav.remainingMeters)}
                  {nav.etaSeconds !== null
                    ? ` · arrive ${formatArrivalClock(nav.etaSeconds)}`
                    : ''}
                </p>
              </div>

              <button
                type="button"
                aria-label={
                  nav.voice.enabled ? 'Turn voice off' : 'Turn voice on'
                }
                aria-pressed={nav.voice.enabled}
                onClick={() => {
                  if (!nav.voice.enabled) {
                    nav.voice.setEnabled(true)
                    nav.voice.unlock()
                  } else {
                    nav.voice.setEnabled(false)
                  }
                }}
                className={cn(
                  'flex size-10 shrink-0 items-center justify-center rounded-xl',
                  nav.voice.enabled
                    ? 'bg-ink text-on-ink'
                    : 'bg-surface text-ink-muted',
                )}
              >
                {nav.voice.enabled ? (
                  <Volume2 className="size-5" />
                ) : (
                  <VolumeX className="size-5" />
                )}
              </button>
            </div>

            {nav.voice.needsUnlock && nav.voice.enabled ? (
              <button
                type="button"
                onClick={() => nav.voice.unlock()}
                className="mt-2.5 w-full rounded-xl bg-surface py-2 text-[12px] font-bold text-ink"
              >
                Enable Voice Navigation
              </button>
            ) : null}

            {leg === 'walk' ? (
              <p className="mt-2.5 text-[10px] leading-relaxed text-ink-faint">
                Walking directions may not always have sidewalks or pedestrian
                paths. Use your judgement.
              </p>
            ) : null}

            {nav.phase === 'rerouting' ? (
              <p className="mt-2.5 text-[11px] font-semibold text-warning">
                Recalculating route…
              </p>
            ) : null}
          </div>
        )}

        {!isTerminal(nav.phase) && !locationBlocked && !routeFailed ? (
          <p className="flex min-w-0 items-center gap-1.5 truncate rounded-xl bg-surface-raised/95 px-3 py-2 text-[11px] font-medium text-ink-muted shadow-sm shadow-black/5 backdrop-blur-sm">
            <MapPin className="size-3.5 shrink-0" />
            <span className="truncate">
              {leg === 'drive' ? space.title : (destination?.name ?? 'Destination')}
            </span>
          </p>
        ) : null}
      </div>
    </div>
  )
}
