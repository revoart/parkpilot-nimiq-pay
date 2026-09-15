import {
  Bookmark,
  Briefcase,
  ChevronRight,
  Clock,
  Home,
  MapPin,
  Search,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
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
import { useParkingSpaces } from '@/hooks/useParkingSpaces'
import { destinationQuery } from '@/hooks/useDestination'
import { getWalkingRoutes, type WalkingLeg } from '@/lib/routing'
import {
  addRecent,
  geocodeAddress,
  getRecents,
  removeRecent,
  getSavedPlaces,
  setSavedPlace,
  TORONTO_PLACES,
  type Place,
  type SavedPlaces,
} from '@/lib/places'
import { listSaved, type SavedParking } from '@/lib/saved'
import type { ParkingSpace } from '@/types'
import { cn } from '@/utils/cn'
import { TORONTO_CENTER, haversineKm, type LatLng } from '@/utils/geo'

type SheetKind = 'home' | 'work' | 'recent'

export function SearchScreen() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { spaces, loading, error, reload } = useParkingSpaces()

  const [query, setQuery] = useState('')
  const [saved, setSaved] = useState<SavedPlaces>({ home: null, work: null })
  const [recents, setRecents] = useState<Place[]>([])
  const [savedPlaces, setSavedPlaces] = useState<SavedParking[]>([])
  const [sheet, setSheet] = useState<SheetKind | null>(null)
  const [geocoding, setGeocoding] = useState(false)
  const [typeFilter, setTypeFilter] = useState<string | null>(null)
  const [evOnly, setEvOnly] = useState(false)
  const [coveredOnly, setCoveredOnly] = useState(false)
  const [maxPrice, setMaxPrice] = useState<number | null>(null)
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
      return { name, lat, lng }
    }
    return null
  }, [params])

  const results = useMemo(() => {
    const origin: LatLng = dest
      ? { lat: dest.lat, lng: dest.lng }
      : TORONTO_CENTER
    const term = query.trim().toLowerCase()
    const base = term
      ? spaces.filter((space) =>
          [space.title, space.address, space.description ?? '']
            .join(' ')
            .toLowerCase()
            .includes(term),
        )
      : spaces

    // Optional refinements — applied on top of the text query.
    const refined = base.filter((space) => {
      if (typeFilter && space.parking_type !== typeFilter) return false
      if (evOnly && !space.ev_charging) return false
      if (coveredOnly && !space.covered) return false
      if (maxPrice !== null && Number(space.price_usdt) > maxPrice) return false
      return true
    })

    return refined
      .map((space) => ({
        space,
        distanceKm: haversineKm(origin, {
          lat: space.latitude,
          lng: space.longitude,
        }),
      }))
      .sort((a, b) => a.distanceKm - b.distanceKm)
  }, [spaces, query, dest, typeFilter, evOnly, coveredOnly, maxPrice])

  // Walking legs for the visible results — one Distance Matrix request, never
  // one call per marker. Cached in lib/routing.
  const [walkLegs, setWalkLegs] = useState<Record<string, WalkingLeg>>({})
  const [walkLoading, setWalkLoading] = useState(false)
  const [sort, setSort] = useState<'price' | 'walk'>('price')

  const walkTargets = useMemo(() => results.slice(0, 10), [results])
  const walkTargetKey = walkTargets.map((item) => item.space.id).join(',')

  useEffect(() => {
    if (!dest || walkTargets.length === 0) {
      setWalkLegs({})
      setWalkLoading(false)
      return
    }
    let active = true
    setWalkLoading(true)
    getWalkingRoutes(
      walkTargets.map(({ space }) => ({
        lat: space.latitude,
        lng: space.longitude,
      })),
      { lat: dest.lat, lng: dest.lng },
    )
      .then((legs) => {
        if (!active) return
        const next: Record<string, WalkingLeg> = {}
        walkTargets.forEach((item, index) => {
          if (legs[index]) next[item.space.id] = legs[index]
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
      const wa = walkLegs[a.space.id]?.durationSeconds
      const wb = walkLegs[b.space.id]?.durationSeconds
      if (wa === undefined && wb === undefined) return a.distanceKm - b.distanceKm
      if (wa === undefined) return 1
      if (wb === undefined) return -1
      return wa - wb
    })
  }, [results, sort, dest, walkLegs])

  // ParkPilot Pick: deterministic blend of price and walk time. Not AI.
  const pickId = useMemo(() => {
    if (!dest || results.length < 3) return null
    const candidates = results.filter((item) => walkLegs[item.space.id])
    if (candidates.length < 3) return null
    const maxPrice = Math.max(
      ...candidates.map((c) => Number(c.space.price_usdt)),
    )
    const maxWalk = Math.max(
      ...candidates.map((c) => walkLegs[c.space.id].durationSeconds),
    )
    let best: { id: string; score: number } | null = null
    for (const item of candidates) {
      const priceScore = maxPrice > 0 ? Number(item.space.price_usdt) / maxPrice : 0
      const walkScore =
        maxWalk > 0 ? walkLegs[item.space.id].durationSeconds / maxWalk : 0
      const score = priceScore * 0.5 + walkScore * 0.5
      if (!best || score < best.score) best = { id: item.space.id, score }
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
    const coords = await geocodeAddress(trimmed)
    const place: Place = {
      id: `custom-${Date.now()}`,
      name: trimmed,
      address: trimmed,
      lat: coords?.lat ?? TORONTO_CENTER.lat,
      lng: coords?.lng ?? TORONTO_CENTER.lng,
    }
    if (sheet === 'home' || sheet === 'work') {
      setSaved(setSavedPlace(sheet, place))
    }
    setGeocoding(false)
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
      places: TORONTO_PLACES,
      allowCustom: true,
      customValue: saved.home?.address ?? '',
    },
    work: {
      title: 'Work address',
      subtitle: 'Set your work address to find parking nearby.',
      places: TORONTO_PLACES,
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

        {dest ? (
          <div className="flex items-center gap-2 rounded-2xl bg-surface-raised px-4 py-3">
            <MapPin className="size-4 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{dest.name}</p>
              <p className="truncate text-xs text-ink-muted">
                {dest.lat.toFixed(4)}, {dest.lng.toFixed(4)}
              </p>
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
          loading ? (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : error ? (
            <EmptyState
              title="Couldn't load parking"
              description={error}
              action={
                <button
                  type="button"
                  onClick={reload}
                  className="rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-on-ink"
                >
                  Retry
                </button>
              }
            />
          ) : results.length === 0 && suggestions.length === 0 ? (
            <EmptyState
              title="No parking found"
              description={
                filtersActive
                  ? 'No spaces match these filters. Try clearing them.'
                  : query.trim()
                    ? `Nothing matches “${query}”.`
                    : 'No parking near this destination yet.'
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
                ) : undefined
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
                <>
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

                  {ordered.map(({ space, distanceKm }) => {
                    const leg = walkLegs[space.id]
                    return (
                      <ParkingCard
                        key={space.id}
                        space={space}
                        distanceKm={dest ? null : distanceKm}
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
                </>
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
        onClose={() => setSheet(null)}
        onSelect={handleSelect}
        onCustomSubmit={(address) => void handleCustomSubmit(address)}
      />
    </AppShell>
  )
}
