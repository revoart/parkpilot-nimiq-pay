import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CornerUpLeft,
  CornerUpRight,
  Flag,
  Footprints,
  LocateFixed,
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
import { useNavigation, type NavigationMode } from '@/hooks/useNavigation'
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

const CARD_SHADOW = 'shadow-[0_4px_12px_rgba(0,0,0,0.04)]'

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

/** "12 min" → ["12", "min"], so the number can be the hero and the unit small. */
function durationParts(text: string): [string, string] {
  const index = text.indexOf(' ')
  if (index < 0) return [text, '']
  return [text.slice(0, index), text.slice(index + 1)]
}

export function NavigationScreen() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const destination = useDestination()
  const { theme } = useTheme()

  /**
   * Two modes share this screen.
   *
   * `/navigate/:id` is a parking journey — drive to the space, then walk to the
   * destination. `/navigate` is general navigation — drive straight to the
   * destination, with no parking involved at all.
   */
  const mode: NavigationMode = id ? 'parking' : 'general'

  const [space, setSpace] = useState<ParkingSpace | null>(null)
  const [loading, setLoading] = useState(mode === 'parking')
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
    // A parking journey drives to the space; general navigation drives to the
    // destination itself. Everything else about the engine is identical.
    driveTarget: mode === 'parking' ? parking : destinationPoint,
    walkFrom: parking,
    walkTo: destinationPoint,
    leg,
    mode,
    enabled:
      mode === 'general'
        ? Boolean(destinationPoint)
        : !loading && Boolean(space),
  })

  // The walk summary is only needed for the parking journey's arrival hand-off,
  // so general navigation never requests a walking route.
  const { route: walkSummary } = useWalkingRoute(
    mode === 'parking' ? parking : null,
    mode === 'parking' ? destinationPoint : null,
  )

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

  // General navigation has nothing to load — it goes straight to routing.
  if (mode === 'parking' && loading) {
    return (
      <div className="absolute inset-0 flex flex-col gap-3 p-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="flex-1 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }

  if (mode === 'parking' && (loadError || !space)) {
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

  const instructionText =
    nav.instruction ??
    (leg === 'walk'
      ? destination
        ? `Walk to ${destination.name}`
        : 'Walk to your destination'
      : mode === 'parking'
        ? space
          ? `Drive to ${space.title}`
          : 'Head to your parking space'
        : destination
          ? `Drive to ${destination.name}`
          : 'Head to your destination')

  const distanceText =
    arrived || destinationArrived
      ? 'Arrived'
      : nav.metersToManeuver > 0
        ? `In ${formatDistance(nav.metersToManeuver)}`
        : 'Following route'

  const etaLabel = nav.etaSeconds !== null ? formatDuration(nav.etaSeconds) : null
  const [etaValue, etaUnit] = etaLabel
    ? durationParts(
        `${etaLabel}${leg === 'walk' ? ' walk' : mode === 'parking' ? ' drive' : ''}`,
      )
    : ['—', '']

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
        bottomInset={240}
      />

      {/* --- Top: the maneuver ------------------------------------------------ */}
      <div className="safe-top pointer-events-none absolute inset-x-4 top-3 z-[1000]">
        <div
          className={cn(
            'pointer-events-auto overflow-hidden rounded-2xl border border-line bg-surface-raised',
            'shadow-[0_8px_24px_rgba(0,0,0,0.07)]',
          )}
        >
          <div className="flex items-center gap-3 p-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand text-brand-fg">
              <ManeuverIcon className="size-6" />
            </span>

            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-[17px] font-bold leading-[21px] tracking-[-0.2px]">
                {instructionText}
              </p>
              <p className="mt-0.5 truncate text-[14px] font-semibold leading-[18px] text-brand">
                {distanceText}
              </p>
            </div>

            <button
              type="button"
              aria-label="Exit navigation"
              onClick={() => navigate(-1)}
              className="flex size-9 shrink-0 items-center justify-center rounded-xl text-ink-faint active:bg-surface"
            >
              <X className="size-5" />
            </button>
          </div>

          {nav.nextInstruction ? (
            <div className="flex items-center gap-2 border-t border-line px-3 py-2">
              <span className="shrink-0 text-[11px] font-bold uppercase tracking-[1px] text-ink-muted">
                Then
              </span>
              <ArrowUp
                aria-hidden="true"
                className="size-3.5 shrink-0 text-ink-soft"
              />
              <p className="truncate text-[14px] leading-[17px] text-ink-soft">
                {nav.nextInstruction}
              </p>
            </div>
          ) : null}
        </div>
      </div>

      {/* --- Bottom: live ETA. Stops short of the Google wordmark strip. ----- */}
      <div className="safe-bottom absolute inset-x-4 bottom-9 z-[1000] space-y-2">
        {liveUpdatesDown ? (
          <p className="rounded-xl bg-warning-bg px-3 py-2 text-[11px] font-semibold text-warning">
            Live location is unavailable — showing the last known route.
          </p>
        ) : null}

        {/* Recenter sits directly above the card, clear of the map controls. */}
        <div className="flex items-center justify-end gap-2">
          {!follow && nav.isActive ? (
            <button
              type="button"
              onClick={() => setFollow(true)}
              className="rounded-full bg-surface-raised/95 px-3 py-2 text-[12px] font-bold text-ink shadow-[0_4px_12px_rgba(0,0,0,0.04)] backdrop-blur-sm"
            >
              Resume following
            </button>
          ) : null}
          <button
            type="button"
            aria-label={follow ? 'Following your location' : 'Recenter on me'}
            onClick={() => setFollow(true)}
            className={cn(
              'flex size-11 items-center justify-center rounded-full shadow-[0_4px_12px_rgba(0,0,0,0.04)] backdrop-blur-sm',
              follow
                ? 'bg-surface-raised/95 text-brand'
                : 'bg-brand-fill text-brand-fg',
            )}
          >
            <LocateFixed className="size-5" />
          </button>
        </div>

        {locationBlocked ? (
          <div className={cn('rounded-2xl border border-line bg-surface-raised p-4', CARD_SHADOW)}>
            <p className="text-[15px] font-bold">
              Location access is needed for live navigation.
            </p>
            <p className="mt-1 text-[13px] text-ink-muted">
              {nav.locationError}
            </p>
            <Button
              full
              size="md"
              className="mt-3"
              onClick={() => window.location.reload()}
            >
              Enable Location
            </Button>
          </div>
        ) : null}

        {routeFailed ? (
          <div className={cn('rounded-2xl border border-line bg-surface-raised p-4', CARD_SHADOW)}>
            <p className="text-[15px] font-bold">Route unavailable</p>
            <p className="mt-1 text-[13px] text-ink-muted">
              {nav.routeError ?? 'We could not calculate a route just now.'}
            </p>
            <Button
              full
              size="md"
              className="mt-3"
              onClick={() => nav.recalculate()}
            >
              Try again
            </Button>
          </div>
        ) : null}

        {arrived ? (
          mode === 'general' || !space ? (
            /* General navigation: the destination is the end of the drive. */
            <div className={cn('rounded-2xl border border-line bg-surface-raised p-4', CARD_SHADOW)}>
              <p className="flex items-center gap-2 text-[17px] font-bold">
                <Flag className="size-5 text-success" />
                You&apos;ve arrived
              </p>
              <p className="mt-1 text-[13px] text-ink-muted">
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
            /* Parking journey: the drive ends at the space, then the walk. */
            <div className={cn('rounded-2xl border border-line bg-surface-raised p-4', CARD_SHADOW)}>
              <p className="flex items-center gap-2 text-[17px] font-bold">
                <Flag className="size-5 text-success" />
                You&apos;ve arrived
              </p>
              <p className="mt-1 text-[13px] text-ink-muted">
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
          )
        ) : destinationArrived ? (
          <div className={cn('rounded-2xl border border-line bg-surface-raised p-4', CARD_SHADOW)}>
            <p className="flex items-center gap-2 text-[17px] font-bold">
              <Flag className="size-5 text-success" />
              You&apos;ve arrived
            </p>
            <p className="mt-1 text-[13px] text-ink-muted">
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
          <div className={cn('rounded-2xl border border-line bg-surface-raised p-4', CARD_SHADOW)}>
            <div className="flex items-center gap-3">
              <p className="flex min-w-0 flex-1 items-baseline gap-1.5">
                <span className="text-[28px] font-extrabold leading-[34px] tracking-[-0.5px]">
                  {etaValue}
                </span>
                {etaUnit ? (
                  <span className="text-[15px] font-bold uppercase tracking-[0.2px] text-ink-muted">
                    {etaUnit}
                  </span>
                ) : null}
              </p>

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
                  'flex size-11 shrink-0 items-center justify-center rounded-xl transition-colors',
                  nav.voice.enabled
                    ? 'bg-brand/10 text-brand'
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

            <div className="my-3 border-t border-line" />

            <div className="flex items-center gap-2">
              <p className="shrink-0 text-[14px] font-semibold">
                {formatDistance(nav.remainingMeters)} left
              </p>
              {nav.etaSeconds !== null ? (
                <>
                  <span aria-hidden="true" className="text-ink-faint">
                    •
                  </span>
                  <p className="min-w-0 flex-1 truncate text-[14px] text-ink-muted">
                    Arrival: {formatArrivalClock(nav.etaSeconds)}
                  </p>
                </>
              ) : null}
              <Button
                variant="danger"
                size="sm"
                className="shrink-0 rounded-full px-3.5 text-[12px] font-bold uppercase tracking-[0.4px]"
                onClick={() => {
                  nav.stop()
                  navigate(-1)
                }}
              >
                {mode === 'parking' ? 'Cancel' : 'End'}
              </Button>
            </div>

            {nav.voice.needsUnlock && nav.voice.enabled ? (
              <Button
                variant="secondary"
                full
                size="md"
                className="mt-3"
                onClick={() => nav.voice.unlock()}
              >
                Enable Voice Navigation
              </Button>
            ) : null}

            {leg === 'walk' ? (
              <p className="mt-3 text-[10px] leading-relaxed text-ink-faint">
                Walking directions may not always have sidewalks or pedestrian
                paths. Use your judgement.
              </p>
            ) : null}

            {nav.phase === 'rerouting' ? (
              <p className="mt-3 text-[11px] font-semibold text-warning">
                Recalculating route…
              </p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}
