import {
  AlertTriangle,
  Bell,
  ChevronDown,
  Crosshair,
  LocateFixed,
  Lock,
  Mic,
  Search,
  Wallet,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { ParkPilotMark } from '@/components/brand/Logo'
import { AppShell } from '@/components/layout/AppShell'
import { ParkingMap } from '@/components/map/ParkingMap'
import { WelcomeSheet } from '@/components/onboarding/WelcomeSheet'
import { ParkingCard } from '@/components/parking/ParkingCard'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Handle } from '@/components/ui/Handle'
import { ParkingCardSkeleton, Skeleton } from '@/components/ui/Skeleton'
import { StateCard } from '@/components/ui/StateCard'
import { WalletPill } from '@/components/wallet/WalletPill'
import { useGeolocation } from '@/hooks/useGeolocation'
import { useNearbyParking } from '@/hooks/useNearbyParking'
import { useWallet } from '@/hooks/useWallet'
import { NEARBY_RADIUS_M } from '@/lib/parking'
import { useUnreadNotificationCount } from '@/lib/notifications/unread'
import { cn } from '@/utils/cn'
import { haversineKm, type LatLng } from '@/utils/geo'

/** The radius the driver can opt into. Widening is never automatic. */
const WIDER_RADIUS_M = 10_000

export function HomeScreen() {
  const navigate = useNavigate()
  const geo = useGeolocation()
  const wallet = useWallet()
  const gated = !wallet.address
  const unread = useUnreadNotificationCount(wallet.address)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [center, setCenter] = useState<LatLng | null>(null)
  const [centeredAt, setCenteredAt] = useState<LatLng | null>(null)
  const [followMe, setFollowMe] = useState(false)
  const [mapCenter, setMapCenter] = useState<LatLng | null>(null)
  const [searchArea, setSearchArea] = useState<LatLng | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [gridView, setGridView] = useState(false)
  const [radius, setRadius] = useState(NEARBY_RADIUS_M)

  useEffect(() => {
    geo.watch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Centre on the first fix.
  useEffect(() => {
    if (geo.coords && !center) {
      setCenter(geo.coords)
      setCenteredAt(geo.coords)
    }
  }, [geo.coords, center])

  // While following, keep the driver centred as they move.
  useEffect(() => {
    if (followMe && geo.coords) {
      setCenter(geo.coords)
      setCenteredAt(geo.coords)
    }
  }, [followMe, geo.coords])

  useEffect(() => {
    if (followMe && geo.error) setFollowMe(false)
  }, [followMe, geo.error])

  /**
   * The centre to search around: the area the driver panned to, otherwise their
   * real location.
   *
   * There is deliberately no fallback centre. Dropping in a fixed city would
   * present parking that has nothing to do with the driver as if it were
   * nearby, and would label a place they are not in as "near you".
   */
  const searchCenter = searchArea ?? geo.coords
  const located = geo.coords !== null

  const { spaces, loading, error, ready, reload } = useNearbyParking(
    searchCenter,
    radius,
  )

  // The database already applied the radius and sorted by distance, so the map
  // and the list render the exact same array. There is no second dataset.
  const visible = spaces

  // Only surface "search this area" when the *map* moved, not the driver.
  const movedAway =
    mapCenter !== null &&
    centeredAt !== null &&
    haversineKm(mapCenter, centeredAt) > 0.4

  const headerLabel = loading
    ? 'Finding parking…'
    : !searchCenter
      ? 'Turn on location'
      : error
        ? "Couldn't load parking"
        : visible.length === 0
          ? `No parking within ${radius / 1000} km`
          : `${searchArea ? 'This area' : 'Near you'} · ${visible.length} within ${
              radius / 1000
            } km`

  const selected = useMemo(
    () => spaces.find((space) => space.id === selectedId) ?? null,
    [spaces, selectedId],
  )

  return (
    <AppShell bleed showNav>
      {/*
        The map and the listings panel are a column, not a stack: the panel sits
        below the map rather than over it. That is what lets the panel run
        full-width and flush to the nav, because Google's attribution renders at
        the bottom of the map element and would otherwise be covered by it.
      */}
      <div className="absolute inset-0 flex flex-col">
        <div className="relative min-h-0 flex-1">
          <ParkingMap
            spaces={gated ? [] : visible}
            center={center ?? searchCenter ?? undefined}
            userLocation={geo.coords}
            selectedId={selectedId}
            onSelect={(space) => setSelectedId(space.id)}
            onCenterChange={setMapCenter}
            onDragStart={() => {
              // Get out of the driver's way and stop following.
              setCollapsed(true)
              setFollowMe(false)
            }}
            // Nothing is drawn over the map now, so the camera no longer needs
            // to offset its targets to clear a panel.
            bottomInset={0}
            className="h-full w-full"
          />

      {/* Top controls — brand chip and wallet, then a full-width search field. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[1000] space-y-2 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="pointer-events-auto flex h-10 items-center gap-2 rounded-full border border-line bg-surface-raised px-3.5 shadow-sm shadow-black/5">
            <ParkPilotMark className="h-[18px]" />
            <span className="text-[11px] font-extrabold uppercase tracking-[0.4px] text-ink">
              ParkPilot
            </span>
          </div>
          <div className="pointer-events-auto flex items-center gap-2">
            <WalletPill />
            <button
              type="button"
              aria-label={
                unread > 0
                  ? `Notifications, ${unread} unread`
                  : 'Notifications'
              }
              onClick={() => navigate('/notifications')}
              className="relative flex size-10 items-center justify-center rounded-full border border-line bg-surface-raised shadow-sm shadow-black/5"
            >
              <Bell className="size-[17px]" />
              {unread > 0 && (
                <span className="absolute right-2.5 top-2.5 size-2 rounded-full border-2 border-surface-raised bg-danger" />
              )}
            </button>
          </div>
        </div>

        <button
          type="button"
          disabled={gated}
          onClick={() => navigate('/search')}
          className="pointer-events-auto flex h-14 w-full items-center gap-3 rounded-2xl bg-surface-raised px-3 text-left shadow-[0_4px_12px_rgba(0,0,0,0.04)] disabled:cursor-not-allowed disabled:opacity-70"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-fill text-brand-fg">
            <Search className="size-[18px]" />
          </span>
          <span className="flex-1 text-left text-[15px] font-medium text-ink-faint">
            {gated ? 'Search disabled until connected' : 'Where are you going?'}
          </span>
          <span
            aria-hidden="true"
            className="flex size-9 shrink-0 items-center justify-center rounded-full text-ink-soft"
          >
            <Mic className="size-[18px]" />
          </span>
        </button>

        {geo.error && !located ? (
          <button
            type="button"
            onClick={() => {
              setFollowMe(true)
              geo.request()
            }}
            className="pointer-events-auto flex w-full items-start gap-2 rounded-2xl bg-warning-bg/95 px-3 py-2 text-left shadow-sm shadow-black/5 backdrop-blur-sm"
          >
            <LocateFixed className="mt-0.5 size-3.5 shrink-0 text-warning" />
            <span className="text-[11px] font-medium leading-snug text-warning">
              {geo.error}
            </span>
          </button>
        ) : null}
      </div>

      {/* Inside the map, so it never collides with the panel below. */}
      {!selected && !collapsed && movedAway && mapCenter ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 z-[1000] flex justify-center px-3">
          <button
            type="button"
            onClick={() => {
              setSearchArea(mapCenter)
            }}
            className="pointer-events-auto rounded-full bg-brand-fill px-3.5 py-1.5 text-[11px] font-bold text-brand-fg shadow-[0_4px_12px_rgba(76,130,255,0.12)]"
          >
            Search this area
          </button>
        </div>
      ) : null}

        </div>

      {/* Selected parking panel (when a map pin is tapped) */}
      {selected ? (
        <div className="sheet-enter relative z-[1000] shrink-0">
          <div className="rounded-t-2xl bg-surface-raised p-4">
            <Handle />
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="truncate text-[20px] font-extrabold tracking-[-0.3px]">
                {selected.distance_m < 1000
                  ? `${Math.round(selected.distance_m)} m away`
                  : `${(selected.distance_m / 1000).toFixed(1)} km away`}
              </span>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="shrink-0 text-[13px] font-bold text-brand"
              >
                Clear
              </button>
            </div>
            <ParkingCard
              space={selected}
              featured
              distanceKm={selected.distance_m / 1000}
              busyUntil={selected.busy_until}
              onSelect={(space) => navigate(`/parking/${space.id}`)}
            />
            <div className="mt-3">
              <Button
                full
                size="lg"
                onClick={() => navigate(`/parking/${selected.id}`)}
              >
                View details
              </Button>
            </div>
          </div>
        </div>
      ) : (
        /* One collapsible panel, full-width and flush to the nav. */
        <div className="relative z-[1000] shrink-0">
          <div className="rounded-t-2xl bg-surface-raised">
            <Handle />
            {!gated && !error ? (
              <div className="flex items-center justify-between gap-2 px-4 pb-1">
                {loading ? (
                  <>
                    <Skeleton className="h-6 w-40 rounded-lg" />
                    <Skeleton className="h-5 w-16 rounded-lg" />
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setCollapsed((value) => !value)}
                      aria-expanded={!collapsed}
                      aria-label={
                        collapsed
                          ? 'Show nearby parking'
                          : 'Hide nearby parking'
                      }
                      className="flex min-w-0 flex-1 items-center gap-1.5 text-left active:opacity-80"
                    >
                      <span className="truncate text-[20px] font-extrabold tracking-[-0.3px]">
                        {headerLabel}
                      </span>
                      <ChevronDown
                        className={cn(
                          'size-4 shrink-0 text-ink-faint transition-transform',
                          collapsed && 'rotate-180',
                        )}
                      />
                    </button>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <button
                        type="button"
                        aria-label="Recenter on my location"
                        onClick={() => {
                          setSearchArea(null)
                          setFollowMe(true)
                          geo.request()
                        }}
                        className={cn(
                          'flex size-8 items-center justify-center rounded-lg active:opacity-80',
                          followMe ? 'text-brand' : 'text-ink-faint',
                        )}
                      >
                        <LocateFixed className="size-[18px]" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setGridView((value) => !value)}
                        className="rounded-lg px-1.5 py-1 text-[13px] font-bold text-brand active:opacity-70"
                      >
                        {gridView ? 'See List' : 'See Grid'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : null}

            {!collapsed ? (
              <div className="px-4 pb-4">
                {gated ? (
                  <StateCard
                    tone="brand"
                    icon={
                      <span className="relative">
                        <Wallet className="size-6" />
                        <span className="absolute -bottom-1 -right-1 flex size-4 items-center justify-center rounded-full bg-accent text-on-ink">
                          <Lock className="size-2.5" />
                        </span>
                      </span>
                    }
                    title="Connect Your Wallet"
                    description="Sign in with your wallet to find and book parking"
                  >
                    <Button
                      full
                      size="lg"
                      onClick={() => void wallet.connect()}
                      loading={wallet.status === 'connecting'}
                    >
                      Connect Wallet
                    </Button>
                  </StateCard>
                ) : error ? (
                  <StateCard
                    tone="danger"
                    icon={<AlertTriangle className="size-6" />}
                    title="Something went wrong"
                    description={error}
                  >
                    <Button full size="lg" onClick={reload}>
                      Retry Connection
                    </Button>
                  </StateCard>
                ) : loading || (searchCenter !== null && !ready) ? (
                  <div className="space-y-2.5" aria-busy="true">
                    <span className="sr-only">Loading nearby parking</span>
                    <ParkingCardSkeleton />
                    <ParkingCardSkeleton />
                  </div>
                ) : visible.length > 0 ? (
                  gridView ? (
                    <div className="grid max-h-[280px] grid-cols-2 gap-2.5 overflow-y-auto pb-1">
                      {visible.slice(0, 8).map((space) => (
                        <ParkingCard
                          key={space.id}
                          compact
                          space={space}
                          distanceKm={space.distance_m / 1000}
                          busyUntil={space.busy_until}
                          onSelect={(item) => navigate(`/parking/${item.id}`)}
                        />
                      ))}
                    </div>
                  ) : (
                    <ParkingCard
                      space={visible[0]}
                      featured
                      distanceKm={visible[0].distance_m / 1000}
                      busyUntil={visible[0].busy_until}
                      onSelect={(space) => navigate(`/parking/${space.id}`)}
                    />
                  )
                ) : (
                  <EmptyState
                    icon={<Crosshair className="size-6" />}
                    title={
                      searchCenter === null
                        ? 'Turn on location'
                        : 'No parking spots nearby'
                    }
                    description={
                      searchCenter === null
                        ? 'Enable location to see what is closest to you.'
                        : 'Nothing is listed in this area right now.'
                    }
                    action={
                      searchCenter === null ? (
                        <Button
                          size="md"
                          onClick={() => {
                            setFollowMe(true)
                            geo.request()
                          }}
                        >
                          Enable Location
                        </Button>
                      ) : radius < WIDER_RADIUS_M ? (
                        <Button
                          size="md"
                          onClick={() => setRadius(WIDER_RADIUS_M)}
                        >
                          Search up to {WIDER_RADIUS_M / 1000} km
                        </Button>
                      ) : (
                        <Button
                          variant="secondary"
                          size="md"
                          onClick={() => navigate('/search')}
                        >
                          Change destination
                        </Button>
                      )
                    }
                  />
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}
      </div>

      <WelcomeSheet />
    </AppShell>
  )
}
