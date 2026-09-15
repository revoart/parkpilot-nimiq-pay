import {
  Bookmark,
  Briefcase,
  Car,
  ChevronRight,
  Clock,
  Home,
  MapPin,
  Navigation,
  Search,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { AppShell } from '@/components/layout/AppShell'
import { WalkBadge } from '@/components/journey'
import { ParkingCard } from '@/components/parking/ParkingCard'
import { PlaceSheet } from '@/components/places/PlaceSheet'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { SwipeToDelete } from '@/components/ui/SwipeToDelete'
import { Skeleton } from '@/components/ui/Skeleton'
import { useAddressSuggestions } from '@/hooks/useAddressSuggestions'
import { useDrivingRoute } from '@/hooks/useDrivingRoute'
import { useGeolocation } from '@/hooks/useGeolocation'
import { useNearbyParking } from '@/hooks/useNearbyParking'
import { destinationQuery } from '@/hooks/useDestination'
import { NEARBY_RADIUS_M } from '@/lib/parking'
import {
  formatDistance,
  formatDuration,
  getWalkingRoutes,
  type WalkingLeg,
} from '@/lib/routing'
import {
  addRecent,
  geocodeAddress,
  getRecents,
  removeRecent,
  getSavedPlaces,
  setSavedPlace,
  type SavedPlaces,
} from '@/lib/places'
import { listSaved, type SavedParking } from '@/lib/saved'
import type { ParkingSpace, Place } from '@/types'
import { cn } from '@/utils/cn'
import type { LatLng } from '@/utils/geo'

type SheetKind = 'home' | 'work' | 'recent'

/** The radius the driver can opt into. Widening is never automatic. */
const WIDER_RADIUS_M = 10_000

export function SearchScreen() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const geo = useGeolocation()

  const [query, setQuery] = useState('')
  const [saved, setSaved] = useState<SavedPlaces>({ home: null, work: null })
  const [recents, setRecents] = useState<Place[]>([])
  const [savedPlaces, setSavedPlaces] = useState<SavedParking[]>([])
  const [sheet, setSheet] = useState<SheetKind | null>(null)
  const [geocoding, setGeocoding] = useState(false)
  const [geocodeError, setGeocodeError] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<string | null>(null)
  const [evOnly, setEvOnly] = useState(false)
  const [coveredOnly, setCoveredOnly] = useState(false)
  const [maxPrice, setMaxPrice] = useState<number | null>(null)
  const [radius, setRadius] = useState(NEARBY_RADIUS_M)
  const { suggestions } = useAddressSuggestions(query)

  useEffect(() => {
    setSaved(getSavedPlaces())
    setRecents(getRecents())
    setSavedPlaces(listSaved())
  }, [])

  const dest = useMemo(() => {
    const name = params.get('name')
    const lat = Number(params.get('lat'))
    const lng = Number(params.get('lng'))
    if (name && Number.isFinite(lat) && Number.isFinite(lng)) {
      return { name, address: params.get('address'), lat, lng }
    }
    return null
  }, [params])

  // Ask for a fix once: without a destination it is the only honest centre we
  // can search around.
  useEffect(() => {
    geo.request()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * The centre to search around: the driver's destination when they have one,
   * otherwise their real location.
   *
   * There is deliberately no fallback centre. Substituting one would present
   * parking that has nothing to do with the driver as if it were nearby.
   */
  const searchCenter = useMemo<LatLng | null>(
    () => (dest ? { lat: dest.lat, lng: dest.lng } : geo.coords),
    [dest, geo.coords],
  )

  const { spaces: nearby, loading, error, ready, reload } = useNearbyParking(
    searchCenter,
    radius,
  )

  /**
   * The drive to the destination itself. This is what makes "Navigate" real
   * without any parking involved — one traffic-aware route, not one per listing.
   */
  const { route: driveRoute } = useDrivingRoute(geo.coords, dest)

  /** Lets "Find Parking" jump to the results rather than hiding them. */
  const resultsRef = useRef<HTMLDivElement | null>(null)

  const results = useMemo(() => {
    const term = query.trim().toLowerCase()
    const base = term
      ? nearby.filter((space) =>
          [space.title, space.address, space.description ?? '']
            .join(' ')
            .toLowerCase()
            .includes(term),
        )
      : nearby

    // Refinements applied on top of the radius query.
    return base.filter((space) => {
      if (typeFilter && space.parking_type !== typeFilter) return false
      if (evOnly && !space.ev_charging) return false
      if (coveredOnly && !space.covered) return false
      if (maxPrice !== null && Number(space.price_usdt) > maxPrice) return false
      return true
    })
  }, [nearby, query, typeFilter, evOnly, coveredOnly, maxPrice])

  // Walking legs for the visible results — one Distance Matrix request, never
  // one call per marker. Cached in lib/routing.
  const [walkLegs, setWalkLegs] = useState<Record<string, WalkingLeg>>({})
  const [walkLoading, setWalkLoading] = useState(false)
  const [sort, setSort] = useState<'price' | 'walk'>('price')

  const walkTargets = useMemo(() => results.slice(0, 10), [results])
  const walkTargetKey = walkTargets.map((space) => space.id).join(',')

  useEffect(() => {
    if (!dest || walkTargets.length === 0) {
      setWalkLegs({})
      setWalkLoading(false)
      return
    }
    let active = true
    setWalkLoading(true)
    getWalkingRoutes(
      walkTargets.map((space) => ({
        lat: space.latitude,
        lng: space.longitude,
      })),
      { lat: dest.lat, lng: dest.lng },
    )
      .then((legs) => {
        if (!active) return
        const next: Record<string, WalkingLeg> = {}
        walkTargets.forEach((space, index) => {
          if (legs[index]) next[space.id] = legs[index]
        })
        setWalkLegs(next)
      })
      .catch(() => {
        if (active) setWalkLegs({})
      })
      .finally(() => {
        if (active) setWalkLoading(false)
      })
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dest?.lat, dest?.lng, walkTargetKey])

  // Price vs walking convenience — the driver decides; we never auto-pick cheapest.
  const ordered = useMemo(() => {
    if (!dest || sort === 'price') return results
    return [...results].sort((a, b) => {
      const wa = walkLegs[a.id]?.durationSeconds
      const wb = walkLegs[b.id]?.durationSeconds
      if (wa === undefined && wb === undefined) return a.distance_m - b.distance_m
      if (wa === undefined) return 1
      if (wb === undefined) return -1
      return wa - wb
    })
  }, [results, sort, dest, walkLegs])

  // ParkPilot Pick: deterministic blend of price and walk time. Not AI.
  const pickId = useMemo(() => {
    if (!dest || results.length < 3) return null
    const candidates = results.filter((space) => walkLegs[space.id])
    if (candidates.length < 3) return null
    const maxPrice = Math.max(
      ...candidates.map((c) => Number(c.price_usdt)),
    )
    const maxWalk = Math.max(
      ...candidates.map((c) => walkLegs[c.id].durationSeconds),
    )
    let best: { id: string; score: number } | null = null
    for (const space of candidates) {
      const priceScore = maxPrice > 0 ? Number(space.price_usdt) / maxPrice : 0
      const walkScore =
        maxWalk > 0 ? walkLegs[space.id].durationSeconds / maxWalk : 0
      const score = priceScore * 0.5 + walkScore * 0.5
      if (!best || score < best.score) best = { id: space.id, score }
    }
    return best?.id ?? null
  }, [results, walkLegs, dest])

  const goToPlace = useCallback(
    (place: Place) => {
      setRecents(addRecent(place))
      setQuery('')
      setParams({
        name: place.name,
        lat: String(place.lat),
        lng: String(place.lng),
      })
    },
    [setParams],
  )

  const openDetail = useCallback(
    (space: ParkingSpace) =>
      navigate(`/parking/${space.id}${destinationQuery(dest)}`),
    [navigate, dest],
  )

  async function handleCustomSubmit(address: string) {
    const trimmed = address.trim()
    if (!trimmed) return
    setGeocoding(true)
    setGeocodeError(null)

    const result = await geocodeAddress(trimmed)
    setGeocoding(false)

    if (!result) {
      // An address we cannot place is an error. It is never a reason to jump
      // the driver to some other city.
      setGeocodeError(
        `We couldn't find “${trimmed}”. Try a more specific address.`,
      )
      return
    }

    const place: Place = {
      // Derived from the coordinates, so the same place dedupes in recents.
      id: result.placeId ?? `geo-${result.lat.toFixed(5)},${result.lng.toFixed(5)}`,
      name: trimmed,
      address: result.label ?? trimmed,
      lat: result.lat,
      lng: result.lng,
      placeId: result.placeId,
    }
    if (sheet === 'home' || sheet === 'work') {
      setSaved(setSavedPlace(sheet, place))
    }
    setSheet(null)
    goToPlace(place)
  }

  function handleSelect(place: Place) {
    if (sheet === 'home' || sheet === 'work') {
      setSaved(setSavedPlace(sheet, place))
    }
    setSheet(null)
    goToPlace(place)
  }

  const sheetConfig = {
    home: {
      title: 'Home address',
      subtitle: 'Set your home address to find parking nearby.',
      places: [],
      allowCustom: true,
      customValue: saved.home?.address ?? '',
    },
    work: {
      title: 'Work address',
      subtitle: 'Set your work address to find parking nearby.',
      places: [],
      allowCustom: true,
      customValue: saved.work?.address ?? '',
    },
    recent: {
      title: 'Recent destinations',
      subtitle: 'Your recently visited places.',
      places: recents,
      allowCustom: false,
      customValue: '',
    },
  }

  const shortcuts = [
    {
      kind: 'home' as const,
      label: 'Home',
      icon: Home,
      value: saved.home?.name ?? 'Set address',
    },
    {
      kind: 'work' as const,
      label: 'Work',
      icon: Briefcase,
      value: saved.work?.name ?? 'Set address',
    },
    {
      kind: 'recent' as const,
      label: 'Recent',
      icon: Clock,
      value: `${recents.length} places`,
    },
  ]

  const filtersActive =
    typeFilter !== null || evOnly || coveredOnly || maxPrice !== null

  const showingResults = Boolean(dest) || query.trim().length > 0

  return (
    <AppShell showBack>
      <div className="space-y-3">
        <div className="flex h-12 items-center gap-2.5 rounded-xl bg-surface px-3.5">
          <Search className="size-4 shrink-0 text-ink-faint" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={dest ? `Near ${dest.name}` : 'Search destination'}
            aria-label="Search destination"
            className="flex-1 bg-transparent text-[15px] font-medium outline-none placeholder:text-ink-faint"
          />
          {dest ? (
            <button
              type="button"
              aria-label="Clear destination"
              onClick={() => setParams({})}
              className="flex size-6 items-center justify-center rounded-full bg-surface-raised"
            >
              <X className="size-3.5 text-ink-soft" />
            </button>
          ) : null}
        </div>

        {/* Home / Work / Recent shortcuts */}
        <div className="grid grid-cols-3 gap-2">
          {shortcuts.map(({ kind, label, icon: Icon, value }) => (
            <button
              key={kind}
              type="button"
              onClick={() => setSheet(kind)}
              className="flex h-16 flex-col items-center justify-center gap-1 rounded-2xl bg-surface-raised px-2 shadow-sm shadow-black/5 active:opacity-80"
            >
              <Icon className="size-4 shrink-0 text-ink-soft" />
              <span className="text-xs font-semibold leading-none">
                {label}
              </span>
              <span className="w-full truncate text-center text-[10px] leading-none text-ink-muted">
                {value}
              </span>
            </button>
          ))}
        </div>

        {/* A destination is a navigation target in its own right. Parking is a
            separate, optional intent — the driver is never forced through it. */}
        {dest ? (
          <div className="rounded-2xl bg-surface-raised p-4">
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 size-4 shrink-0 text-ink-soft" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-bold">{dest.name}</p>
                <p className="mt-0.5 truncate text-xs text-ink-muted">
                  {dest.address ??
                    `${dest.lat.toFixed(4)}, ${dest.lng.toFixed(4)}`}
                </p>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-surface">
                <Car className="size-4 text-ink" />
              </span>
              {driveRoute ? (
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-bold leading-tight">
                    {driveRoute.source === 'estimate' ? '~' : ''}
                    {formatDuration(driveRoute.durationSeconds)} drive
                    {driveRoute.trafficAware ? (
                      <span className="ml-1.5 align-middle text-[10px] font-bold uppercase tracking-[0.6px] text-success">
                        live traffic
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    {formatDistance(driveRoute.distanceMeters)}
                  </p>
                </div>
              ) : (
                <p className="flex-1 text-[13px] text-ink-muted">
                  {geo.coords
                    ? 'Calculating drive time…'
                    : 'Turn on location for drive time'}
                </p>
              )}
            </div>

            <div className="mt-3 flex items-center gap-2">
              <Button
                size="lg"
                className="flex-1"
                onClick={() =>
                  navigate(`/navigate${destinationQuery(dest)}`)
                }
              >
                <Navigation className="mr-1.5 size-4" />
                Navigate
              </Button>
              <Button
                variant="secondary"
                size="lg"
                className="flex-1"
                onClick={() =>
                  resultsRef.current?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start',
                  })
                }
              >
                Find Parking
              </Button>
            </div>
          </div>
        ) : null}

        {/* Refinements — hidden until there is something to refine. */}
        {showingResults ? (
          <div className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {(
              [
                ['garage', 'Garage'],
                ['underground', 'Underground'],
                ['lot', 'Surface lot'],
                ['street', 'Street'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={typeFilter === value}
                onClick={() =>
                  setTypeFilter(typeFilter === value ? null : value)
                }
                className={cn(
                  'shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold transition',
                  typeFilter === value
                    ? 'bg-ink text-on-ink'
                    : 'bg-surface-raised text-ink-muted',
                )}
              >
                {label}
              </button>
            ))}
            <button
              type="button"
              aria-pressed={evOnly}
              onClick={() => setEvOnly((v) => !v)}
              className={cn(
                'shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold transition',
                evOnly ? 'bg-ink text-on-ink' : 'bg-surface-raised text-ink-muted',
              )}
            >
              EV
            </button>
            <button
              type="button"
              aria-pressed={coveredOnly}
              onClick={() => setCoveredOnly((v) => !v)}
              className={cn(
                'shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold transition',
                coveredOnly
                  ? 'bg-ink text-on-ink'
                  : 'bg-surface-raised text-ink-muted',
              )}
            >
              Covered
            </button>
            <button
              type="button"
              aria-pressed={maxPrice !== null}
              onClick={() => setMaxPrice(maxPrice === null ? 5 : null)}
              className={cn(
                'shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold transition',
                maxPrice !== null
                  ? 'bg-ink text-on-ink'
                  : 'bg-surface-raised text-ink-muted',
              )}
            >
              Under $5
            </button>
          </div>
        ) : null}

        {showingResults ? (
          loading || (searchCenter !== null && !ready && !error) ? (
            <div className="space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-[1.2px] text-ink-faint">
                Finding nearby parking…
              </p>
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : error ? (
            <EmptyState
              title="Parking couldn't be loaded"
              description={error}
              action={
                <button
                  type="button"
                  onClick={reload}
                  className="rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-on-ink"
                >
                  Try again
                </button>
              }
            />
          ) : searchCenter === null ? (
            /* No destination and no location: we have no honest centre to
               search around, so we ask rather than inventing one. */
            <EmptyState
              title="Choose a destination"
              description="Search for where you're going, or turn on location, to see parking nearby."
              action={
                <Button size="md" onClick={() => geo.request()}>
                  Enable Location
                </Button>
              }
            />
          ) : results.length === 0 && suggestions.length === 0 ? (
            <EmptyState
              title="No parking available"
              description={
                filtersActive
                  ? 'No spaces match these filters. Try clearing them.'
                  : query.trim()
                    ? `Nothing matches “${query}” within ${
                        radius / 1000
                      } km.`
                    : `We couldn't find an available parking space within ${
                        radius / 1000
                      } km of ${dest ? dest.name : 'your location'}.`
              }
              action={
                filtersActive ? (
                  <Button
                    variant="secondary"
                    size="md"
                    onClick={() => {
                      setTypeFilter(null)
                      setEvOnly(false)
                      setCoveredOnly(false)
                      setMaxPrice(null)
                    }}
                  >
                    Clear filters
                  </Button>
                ) : radius < WIDER_RADIUS_M ? (
                  /* Widening is an explicit driver choice, never silent. */
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
          ) : (
            <div className="space-y-3">
              {suggestions.length > 0 ? (
                <div className="overflow-hidden rounded-2xl bg-surface-raised">
                  <p className="px-4 pt-3 text-[10px] font-bold uppercase tracking-[1.2px] text-ink-faint">
                    Addresses
                  </p>
                  {suggestions.map((suggestion) => (
                    <button
                      key={suggestion.id}
                      type="button"
                      onClick={() =>
                        goToPlace({
                          id: suggestion.id,
                          name: suggestion.name,
                          address: suggestion.address,
                          lat: suggestion.lat,
                          lng: suggestion.lng,
                        })
                      }
                      className="flex w-full items-center gap-3 px-4 py-3 text-left active:opacity-70"
                    >
                      <MapPin className="size-4 shrink-0 text-ink-soft" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-semibold">
                          {suggestion.name}
                        </span>
                        <span className="block truncate text-xs text-ink-muted">
                          {suggestion.address}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}

                {results.length > 0 ? (
                  <div ref={resultsRef} className="space-y-3 scroll-mt-2">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-bold uppercase tracking-[1.2px] text-ink-faint">
                        {results.length} results{dest ? ` near ${dest.name}` : ''}
                    </p>
                    {dest ? (
                      <div className="flex items-center gap-0.5 rounded-lg bg-surface p-0.5">
                        {(['price', 'walk'] as const).map((mode) => (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => setSort(mode)}
                            className={cn(
                              'rounded-md px-2.5 py-1 text-[11px] font-semibold transition',
                              sort === mode
                                ? 'bg-surface-raised text-ink shadow-sm shadow-black/5'
                                : 'text-ink-muted',
                            )}
                          >
                            {mode === 'price' ? 'Price' : 'Walk'}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  {ordered.map((space) => {
                    const leg = walkLegs[space.id]
                    return (
                      <ParkingCard
                        key={space.id}
                        space={space}
                        distanceKm={dest ? null : space.distance_m / 1000}
                        busyUntil={space.busy_until}
                        onSelect={openDetail}
                        badge={
                          pickId === space.id ? '✦ ParkPilot Pick' : null
                        }
                        walkSlot={
                          dest ? (
                            <WalkBadge
                              route={
                                leg
                                  ? {
                                      distanceMeters: leg.distanceMeters,
                                      durationSeconds: leg.durationSeconds,
                                      path: null,
                                      source: leg.source,
                                    }
                                  : null
                              }
                              loading={walkLoading}
                            />
                          ) : null
                        }
                      />
                    )
                  })}
                  </div>
                ) : null}
            </div>
          )
        ) : (
          <>
            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[1.2px] text-ink-faint">
                Recent
              </p>
              {recents.map((place) => (
                <SwipeToDelete
                  key={place.id}
                  label="Remove"
                  onDelete={() => setRecents(removeRecent(place.id))}
                >
                  <button
                    type="button"
                    onClick={() => goToPlace(place)}
                    className="flex w-full items-center gap-3 bg-canvas px-1 py-3 active:opacity-70"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface">
                      <Clock className="size-4 text-ink-muted" />
                    </span>
                    <span className="min-w-0 flex-1 text-left">
                      <span className="block truncate text-[14px] font-semibold">
                        {place.name}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-ink-muted">
                        {place.address}
                      </span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-ink-faint" />
                  </button>
                </SwipeToDelete>
              ))}
            </div>

            {savedPlaces.length > 0 ? (
              <div>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[1.2px] text-ink-faint">
                  Saved places
                </p>
                {savedPlaces.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => navigate(`/parking/${item.id}`)}
                    className="flex w-full items-center gap-3 py-3.5 active:opacity-70"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface">
                      <Bookmark className="size-4 text-ink-muted" />
                    </span>
                    <span className="min-w-0 flex-1 text-left">
                      <span className="block truncate text-[15px] font-semibold">
                        {item.title}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-ink-muted">
                        {item.address}
                      </span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-ink-faint" />
                  </button>
                ))}
              </div>
            ) : null}
          </>
        )}
      </div>

      <PlaceSheet
        open={sheet !== null}
        title={sheet ? sheetConfig[sheet].title : ''}
        subtitle={sheet ? sheetConfig[sheet].subtitle : undefined}
        places={sheet ? sheetConfig[sheet].places : []}
        allowCustom={sheet ? sheetConfig[sheet].allowCustom : false}
        customValue={sheet ? sheetConfig[sheet].customValue : ''}
        submitting={geocoding}
        error={geocodeError}
        onClose={() => {
          setGeocodeError(null)
          setSheet(null)
        }}
        onSelect={handleSelect}
        onCustomSubmit={(address) => void handleCustomSubmit(address)}
      />
    </AppShell>
  )
}
