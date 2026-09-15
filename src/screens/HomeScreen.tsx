import { Bell, ChevronDown, LocateFixed, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { ParkPilotMark } from '@/components/brand/Logo'
import { AppShell } from '@/components/layout/AppShell'
import { ParkingMap } from '@/components/map/ParkingMap'
import { WelcomeSheet } from '@/components/onboarding/WelcomeSheet'
import { ParkingCard } from '@/components/parking/ParkingCard'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
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
/** Approximate height of the listings panel, so pins stay clear of it. */
const PANEL_INSET = 236
/** Collapsed panel height (header row only). */
const COLLAPSED_INSET = 96

export function HomeScreen() {
  const navigate = useNavigate()
  const geo = useGeolocation()
  const wallet = useWallet()
  const unread = useUnreadNotificationCount(wallet.address)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [center, setCenter] = useState<LatLng | null>(null)
  const [centeredAt, setCenteredAt] = useState<LatLng | null>(null)
  const [followMe, setFollowMe] = useState(false)
  const [mapCenter, setMapCenter] = useState<LatLng | null>(null)
  const [searchArea, setSearchArea] = useState<LatLng | null>(null)
  const [collapsed, setCollapsed] = useState(false)
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
      <div className="absolute inset-0">
        <ParkingMap
          spaces={visible}
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
          bottomInset={collapsed ? COLLAPSED_INSET : PANEL_INSET}
          className="h-full w-full"
        />
      </div>

      {/* Top controls — one aligned row, then a full-width search field. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[1000] space-y-2 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="pointer-events-auto flex h-10 items-center gap-2 rounded-xl bg-surface-raised/95 px-3 shadow-sm shadow-black/5 backdrop-blur-sm">
            <ParkPilotMark className="h-5" />
            <span className="text-[13px] font-bold tracking-[-0.2px]">
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
              className="relative flex size-10 items-center justify-center rounded-xl bg-surface-raised/95 shadow-sm shadow-black/5 backdrop-blur-sm"
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
          onClick={() => navigate('/search')}
          className="pointer-events-auto flex h-11 w-full items-center gap-2.5 rounded-xl bg-surface-raised px-3.5 shadow-sm shadow-black/5"
        >
          <Search className="size-[17px] text-ink-faint" />
          <span className="flex-1 text-left text-[14px] font-medium text-ink-faint">
            Where are you going?
          </span>
          <span className="rounded-lg bg-surface px-2 py-0.5 text-[11px] font-semibold">
            Now
          </span>
        </button>

        {geo.error && !located ? (
          <button
            type="button"
            onClick={() => {
              setFollowMe(true)
              geo.request()
            }}
            className="pointer-events-auto flex w-full items-start gap-2 rounded-xl bg-warning-bg/95 px-3 py-2 text-left shadow-sm shadow-black/5 backdrop-blur-sm"
          >
            <LocateFixed className="mt-0.5 size-3.5 shrink-0 text-warning" />
            <span className="text-[11px] font-medium leading-snug text-warning">
              {geo.error}
            </span>
          </button>
        ) : null}
      </div>

      {/* Sits above the panel so it never collides with it. */}
      {!selected && !collapsed && movedAway && mapCenter ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-[268px] z-[1000] flex justify-center px-3">
          <button
            type="button"
            onClick={() => {
              setSearchArea(mapCenter)
            }}
            className="pointer-events-auto rounded-full bg-ink px-3.5 py-1.5 text-[11px] font-bold text-on-ink shadow-md shadow-black/20"
          >
            Search this area
          </button>
        </div>
      ) : null}

      {/* Selected parking sheet (when a map pin is tapped) */}
      {selected ? (
        <div className="sheet-enter absolute inset-x-0 bottom-0 z-[1000] px-3 pb-7">
          <div className="rounded-2xl bg-surface-raised p-3.5 shadow-lg shadow-black/10">
            <div className="mb-2.5 flex items-center justify-between">
              <p className="text-[12px] font-medium text-ink-muted">
                {selected.distance_m < 1000
                  ? `${Math.round(selected.distance_m)} m away`
                  : `${(selected.distance_m / 1000).toFixed(1)} km away`}
              </p>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="text-[12px] font-semibold text-ink-muted"
              >
                Clear
              </button>
            </div>
            <ParkingCard
              space={selected}
              featured
              busyUntil={selected.busy_until}
              onSelect={(space) => navigate(`/parking/${space.id}`)}
            />
            <div className="mt-2.5">
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
        /* One collapsible panel, kept clear of Google's attribution strip. */
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1000] px-3 pb-7">
          <div className="pointer-events-auto rounded-2xl bg-surface-raised/95 shadow-lg shadow-black/10 backdrop-blur-sm">
            <div className="flex items-center justify-between gap-2 px-2.5 py-2">
              <button
                type="button"
                onClick={() => setCollapsed((value) => !value)}
                aria-expanded={!collapsed}
                aria-label={
                  collapsed ? 'Show nearby parking' : 'Hide nearby parking'
                }
                className="flex min-w-0 flex-1 items-center gap-2 text-left active:opacity-80"
              >
                <span className="truncate rounded-full bg-surface px-2.5 py-0.5 text-[11px] font-bold">
                  {loading ? 'Finding parking…' : headerLabel}
                </span>
                <ChevronDown
                  className={cn(
                    'size-4 shrink-0 text-ink-faint transition-transform',
                    collapsed && 'rotate-180',
                  )}
                />
              </button>
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
                  followMe ? 'bg-ink text-on-ink' : 'bg-surface',
                )}
              >
                <LocateFixed className="size-4" />
              </button>
            </div>

            {!collapsed ? (
              <div className="px-2.5 pb-2.5">
                {error ? (
                  <button
                    type="button"
                    onClick={reload}
                    className="mb-2 w-full rounded-lg bg-surface px-3 py-1.5 text-[11px] font-semibold text-ink-muted"
                  >
                    Couldn&apos;t load parking · Retry
                  </button>
                ) : null}

                {loading || (searchCenter !== null && !ready && !error) ? (
                  <div className="flex gap-2.5 overflow-hidden">
                    <Skeleton className="h-[104px] w-[176px] shrink-0 rounded-2xl" />
                    <Skeleton className="h-[104px] w-[176px] shrink-0 rounded-2xl" />
                  </div>
                ) : visible.length > 0 ? (
                  <div className="flex snap-x snap-mandatory gap-2.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {visible.slice(0, 8).map((space) => (
                      <div
                        key={space.id}
                        className="w-[176px] shrink-0 snap-start"
                      >
                        <ParkingCard
                          compact
                          space={space}
                          distanceKm={space.distance_m / 1000}
                          busyUntil={space.busy_until}
                          onSelect={(item) => navigate(`/parking/${item.id}`)}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="px-1 pb-1">
                    <p className="text-[13px] font-semibold">
                      {searchCenter === null
                        ? 'Turn on location'
                        : `No parking within ${radius / 1000} km`}
                    </p>
                    <p className="mt-0.5 text-[11px] text-ink-muted">
                      {searchCenter === null
                        ? 'Enable location to see what is closest to you.'
                        : error
                          ? error
                          : 'Nothing is listed in this area right now.'}
                    </p>
                    {searchCenter === null ? (
                      <button
                        type="button"
                        onClick={() => {
                          setFollowMe(true)
                          geo.request()
                        }}
                        className="mt-2 rounded-lg bg-ink px-3 py-1.5 text-[11px] font-bold text-on-ink"
                      >
                        Enable Location
                      </button>
                    ) : radius < WIDER_RADIUS_M ? (
                      <button
                        type="button"
                        onClick={() => setRadius(WIDER_RADIUS_M)}
                        className="mt-2 rounded-lg bg-ink px-3 py-1.5 text-[11px] font-bold text-on-ink"
                      >
                        Search up to {WIDER_RADIUS_M / 1000} km
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => navigate('/search')}
                        className="mt-2 rounded-lg bg-ink px-3 py-1.5 text-[11px] font-bold text-on-ink"
                      >
                        Change destination
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}

      <WelcomeSheet />
    </AppShell>
  )
}
