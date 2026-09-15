/// <reference types="google.maps" />
import { useEffect, useRef, useState } from 'react'
import { LocateFixed } from 'lucide-react'

import { useTheme } from '@/hooks/useTheme'
import {
  destinationIcon,
  dotIcon,
  headingIcon,
  isMapsConfigured,
  loadMaps,
  onMapsAuthFailure,
  pinIcon,
  priceIcon,
  resolveMapId,
} from '@/lib/maps/loader'
import { mapInitOptions, mapThemeOptions, rotationFor } from '@/lib/maps/options'
import { exposeMapDebug } from '@/lib/maps/debug'
import { DEFAULT_MAP_CENTER, type LatLng } from '@/utils/geo'
import { cn } from '@/utils/cn'

export interface MapPoint {
  id: string
  lat: number
  lng: number
  label?: string
  variant?: 'price' | 'pin'
}

/**
 * Ceiling on how many times we will re-apply a heading before giving up.
 *
 * Google resets the heading during initialisation, so we correct it — but a
 * hard cap means a map that simply cannot rotate (a raster renderer behind a
 * vector Map ID) can never turn the correction into a feedback loop.
 */
const MAX_HEADING_ATTEMPTS = 20

interface GoogleMapProps {
  points: MapPoint[]
  selectedId?: string | null
  onSelect?: (id: string) => void
  center?: LatLng
  zoom?: number
  me?: LatLng | null
  /** The driver's actual destination — drawn distinctly from parking pins. */
  destination?: LatLng | null
  /** Walking route geometry between the parking space and the destination. */
  walkPath?: LatLng[] | null
  /**
   * The active navigation route (driving or walking). Drawn on top of
   * everything else because it is what the driver is following right now.
   */
  routePath?: LatLng[] | null
  /** Colour for `routePath`. */
  routeColor?: string
  /** Dash the active route (used for the walking leg). */
  routeDashed?: boolean
  /** Device heading in degrees — rotates the position arrow. */
  heading?: number | null
  /** Keep the camera locked on the driver. */
  follow?: boolean
  /** Zoom used while following. */
  followZoom?: number
  /** Draw the position as a heading arrow instead of a dot. */
  meVariant?: 'dot' | 'arrow'
  /**
   * Show the built-in recenter button. Turn this off when the caller renders
   * its own, so the map never shows two competing controls.
   */
  showRecenter?: boolean
  /** Fires after the map settles, so callers can offer "search this area". */
  onCenterChange?: (center: LatLng) => void
  /** Fires when the user starts dragging the map (not programmatic moves). */
  onDragStart?: () => void
  /**
   * Pixels of the map's bottom that are covered by app UI (e.g. the listings
   * panel). Used to pad `fitBounds` and to offset `panTo` so targets and pins
   * never land behind it.
   */
  bottomInset?: number
  interactive?: boolean
  className?: string
}

function iconFor(point: MapPoint, active: boolean) {
  if (point.variant === 'pin') return pinIcon(point.label)
  if (point.label) return priceIcon(point.label, active)
  return dotIcon(active ? '#0F0F0F' : '#15803D')
}

/**
 * Google Maps JavaScript API map. Uses the legacy `google.maps.Marker`, which
 * needs no Map ID and cannot hit the `AdvancedMarkerElement` failure mode.
 */
export function GoogleMap({
  points,
  selectedId = null,
  onSelect,
  center,
  zoom = 14,
  me = null,
  destination = null,
  walkPath = null,
  routePath = null,
  routeColor = '#0F0F0F',
  routeDashed = false,
  heading = null,
  follow = false,
  followZoom = 17,
  meVariant = 'dot',
  showRecenter = true,
  onCenterChange,
  onDragStart,
  bottomInset = 0,
  interactive = true,
  className,
}: GoogleMapProps) {
  const { theme } = useTheme()
  const container = useRef<HTMLDivElement | null>(null)
  const map = useRef<google.maps.Map | null>(null)
  const markers = useRef(new Map<string, google.maps.Marker>())
  const meMarker = useRef<google.maps.Marker | null>(null)
  const destinationMarker = useRef<google.maps.Marker | null>(null)
  const walkLine = useRef<google.maps.Polyline | null>(null)
  const routeLine = useRef<google.maps.Polyline | null>(null)
  /** True when the map is rendering vector tiles (a Map ID was accepted). */
  const vectorRef = useRef(false)
  /**
   * The heading the camera should hold. Kept in a ref so the `idle` handler
   * can re-assert it after Google internally resets it.
   */
  const desiredHeading = useRef<number | null>(null)
  /**
   * How many times we have re-asserted the current heading. Google discards a
   * heading set while the map is still initialising, so we re-apply once the
   * camera settles — but a hard cap stops any chance of a feedback loop.
   */
  const headingAttempts = useRef(0)
  const onCenterChangeRef = useRef(onCenterChange)
  const onDragStartRef = useRef(onDragStart)
  const bottomInsetRef = useRef(bottomInset)
  /** Timestamp of the last camera move we caused, so we can ignore its idle. */
  const lastProgrammaticMove = useRef(0)

  useEffect(() => {
    onCenterChangeRef.current = onCenterChange
  }, [onCenterChange])

  useEffect(() => {
    onDragStartRef.current = onDragStart
  }, [onDragStart])

  useEffect(() => {
    bottomInsetRef.current = bottomInset
  }, [bottomInset])
  const onSelectRef = useRef(onSelect)
  const themeRef = useRef(theme)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(() => !isMapsConfigured())

  useEffect(() => {
    onSelectRef.current = onSelect
  }, [onSelect])

  useEffect(() => {
    themeRef.current = theme
  }, [theme])

  useEffect(() => {
    if (!isMapsConfigured()) {
      setFailed(true)
      return
    }

    const markerMap = markers.current
    let cancelled = false
    const unsubscribe = onMapsAuthFailure(() => {
      if (!cancelled) setFailed(true)
    })

    loadMaps()
      .then((maps) => {
        if (cancelled || !container.current) return
        const first = points[0]
        const mapId = resolveMapId()

        const create = (id: string | null): google.maps.Map => {
          const options: google.maps.MapOptions = {
            center:
              center ??
              (first ? { lat: first.lat, lng: first.lng } : DEFAULT_MAP_CENTER),
            zoom,
            disableDefaultUI: true,
            gestureHandling: interactive ? 'greedy' : 'none',
            clickableIcons: false,
            ...mapInitOptions(themeRef.current, id),
          }
          return new maps.Map(container.current as HTMLElement, options)
        }

        let instance: google.maps.Map
        try {
          instance = create(mapId)
        } catch (error) {
          // A wrong or deleted Map ID must not leave the driver with a dead
          // map — fall back to the raster renderer instead.
          if (!mapId) throw error
          console.warn('Map ID was rejected, falling back to a raster map.', error)
          map.current = null
          instance = create(null)
          vectorRef.current = false
        }

        if (mapId && instance) vectorRef.current = true

        map.current = instance

        // Optional debug handle (VITE_DEBUG_MAP=true) so camera state can be
        // asserted from automated checks instead of guessed from pixels.
        exposeMapDebug('__PARKPILOT_MAP__', instance)

        // ParkPilot drives the camera; the driver pans. Rotating by accident
        // mid-navigation would be disorienting, so the gesture is disabled.
        // The tilt is deliberately left alone: changing it makes Google reset
        // the heading to north.
        if (vectorRef.current) {
          instance.setHeadingInteractionEnabled(false)
        }

        instance.addListener('idle', () => {
          // Ignore the settle that follows our own camera moves — only the
          // user moving the map should count as "the map moved".
          if (Date.now() - lastProgrammaticMove.current < 700) return
          const current = instance.getCenter()
          if (current) {
            onCenterChangeRef.current?.({
              lat: current.lat(),
              lng: current.lng(),
            })
          }
        })
        instance.addListener('dragstart', () => {
          onDragStartRef.current?.()
        })

        // Google zeroes the heading while the vector renderer initialises, and
        // again whenever the tilt settles. Reacting to the map's own
        // `heading_changed` event corrects that immediately, rather than
        // waiting for a timer that a background tab would throttle.
        instance.addListener('heading_changed', () => {
          const want = desiredHeading.current
          if (want === null || !vectorRef.current) return
          // Only skip a map we know is raster. Google reports UNINITIALIZED
          // while the vector renderer is still coming up, and in that window
          // the map is already rotating — gating on VECTOR here made the
          // correction dead code.
          if (instance.getRenderingType() === 'RASTER') return
          if (Math.abs((instance.getHeading() ?? 0) - want) <= 0.5) return
          if (headingAttempts.current >= MAX_HEADING_ATTEMPTS) return
          headingAttempts.current += 1
          instance.setHeading(want)
        })
        setReady(true)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })

    return () => {
      cancelled = true
      unsubscribe()
      markerMap.forEach((marker) => marker.setMap(null))
      markerMap.clear()
      meMarker.current = null
      destinationMarker.current = null
      walkLine.current = null
      routeLine.current = null
      vectorRef.current = false
      map.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Re-paint the map when the app theme changes. Vector maps take a colour
  // scheme (their styling lives in the cloud); raster maps take inline styles.
  // The Map ID is deliberately not re-sent — that would reset the camera.
  useEffect(() => {
    if (!ready) return
    map.current?.setOptions(
      mapThemeOptions(theme, vectorRef.current ? resolveMapId() : null),
    )
  }, [ready, theme])

  // Keep markers in sync on every render.
  useEffect(() => {
    const instance = map.current
    if (!ready || !instance) return

    const seen = new Set<string>()
    for (const point of points) {
      seen.add(point.id)
      const active = point.id === selectedId
      let marker = markers.current.get(point.id)
      if (!marker) {
        marker = new google.maps.Marker({
          map: instance,
          position: { lat: point.lat, lng: point.lng },
        })
        marker.addListener('click', () => onSelectRef.current?.(point.id))
        markers.current.set(point.id, marker)
      }
      marker.setPosition({ lat: point.lat, lng: point.lng })
      marker.setIcon(iconFor(point, active))
      marker.setZIndex(active ? 999 : 1)
    }

    for (const [id, marker] of markers.current) {
      if (!seen.has(id)) {
        marker.setMap(null)
        markers.current.delete(id)
      }
    }
  })

  const pointKey = points.map((p) => `${p.id}:${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join('|')
  const centerKey = center ? `${center.lat.toFixed(5)},${center.lng.toFixed(5)}` : ''
  const destinationKey = destination
    ? `${destination.lat.toFixed(5)},${destination.lng.toFixed(5)}`
    : ''

  useEffect(() => {
    const instance = map.current
    if (!ready || !instance) return

    const inset = bottomInsetRef.current
    const padding = { top: 80, right: 16, bottom: inset + 16, left: 16 }
    lastProgrammaticMove.current = Date.now()

    /** Shift a camera target up so it renders clear of the covered strip. */
    const padded = (target: LatLng): LatLng => {
      if (inset <= 0) return target
      const projection = instance.getProjection()
      const zoom = instance.getZoom()
      if (!projection || zoom === undefined) return target
      const point = projection.fromLatLngToPoint(new google.maps.LatLng(target))
      if (!point) return target
      // World units per pixel at this zoom is 1 / 2^zoom.
      const shifted = new google.maps.Point(
        point.x,
        point.y + inset / 2 / Math.pow(2, zoom),
      )
      const next = projection.fromPointToLatLng(shifted)
      return next ? { lat: next.lat(), lng: next.lng() } : target
    }

    // With a destination, frame the whole journey: parking + destination.
    if (destination) {
      const bounds = new google.maps.LatLngBounds()
      points.forEach((point) => bounds.extend({ lat: point.lat, lng: point.lng }))
      bounds.extend(destination)

      // When the two are metres apart (parking at the destination), fitBounds
      // zooms to an unreadable level — use a sensible street zoom instead.
      const northEast = bounds.getNorthEast()
      const southWest = bounds.getSouthWest()
      const span = Math.max(
        Math.abs(northEast.lat() - southWest.lat()),
        Math.abs(northEast.lng() - southWest.lng()),
      )
      if (span < 0.0015) {
        instance.setCenter(
          padded({
            lat: (northEast.lat() + southWest.lat()) / 2,
            lng: (northEast.lng() + southWest.lng()) / 2,
          }),
        )
        instance.setZoom(16)
      } else {
        instance.fitBounds(bounds, padding)
      }
      return
    }

    const selected = points.find((point) => point.id === selectedId)
    if (selected) {
      instance.panTo(padded({ lat: selected.lat, lng: selected.lng }))
    } else if (center) {
      instance.panTo(padded(center))
    } else if (points.length > 1) {
      const bounds = new google.maps.LatLngBounds()
      points.forEach((point) => bounds.extend({ lat: point.lat, lng: point.lng }))
      instance.fitBounds(bounds, padding)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, selectedId, pointKey, centerKey, destinationKey])

  const meLat = me?.lat
  const meLng = me?.lng

  useEffect(() => {
    const instance = map.current
    if (!ready || !instance || meLat === undefined || meLng === undefined) return

    const position = { lat: meLat, lng: meLng }
    if (!meMarker.current) {
      meMarker.current = new google.maps.Marker({
        map: instance,
        position,
        zIndex: 500,
      })
    }
    meMarker.current.setPosition(position)
    meMarker.current.setIcon(
      meVariant === 'arrow' ? headingIcon(heading) : dotIcon('#2563EB'),
    )
  }, [ready, meLat, meLng, meVariant, heading])

  const destLat = destination?.lat
  const destLng = destination?.lng

  useEffect(() => {
    const instance = map.current
    if (!ready || !instance) return

    if (destLat === undefined || destLng === undefined) {
      destinationMarker.current?.setMap(null)
      destinationMarker.current = null
      return
    }

    const position = { lat: destLat, lng: destLng }
    if (!destinationMarker.current) {
      destinationMarker.current = new google.maps.Marker({
        map: instance,
        position,
        zIndex: 900,
        icon: destinationIcon(),
        title: 'Your destination',
      })
    }
    destinationMarker.current.setPosition(position)
  }, [ready, destLat, destLng])

  const walkKey = walkPath?.length
    ? `${walkPath.length}:${walkPath[0].lat.toFixed(5)},${walkPath[0].lng.toFixed(5)}`
    : ''

  useEffect(() => {
    const instance = map.current
    if (!ready || !instance) return

    walkLine.current?.setMap(null)
    walkLine.current = null

    if (!walkPath || walkPath.length < 2) return

    walkLine.current = new google.maps.Polyline({
      map: instance,
      path: walkPath,
      strokeColor: '#2563EB',
      strokeOpacity: 0.25,
      strokeWeight: 5,
      zIndex: 400,
      icons: [
        {
          icon: {
            path: 'M 0,-1 0,1',
            strokeOpacity: 0.9,
            strokeColor: '#2563EB',
            scale: 3,
          },
          offset: '0',
          repeat: '12px',
        },
      ],
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, walkKey])

  const routeKey = routePath?.length
    ? `${routePath.length}:${routePath[0].lat.toFixed(5)},${routePath[0].lng.toFixed(5)}`
    : ''

  // The route being followed — drawn above every other layer.
  useEffect(() => {
    const instance = map.current
    if (!ready || !instance) return

    routeLine.current?.setMap(null)
    routeLine.current = null

    if (!routePath || routePath.length < 2) return

    routeLine.current = new google.maps.Polyline({
      map: instance,
      path: routePath,
      strokeColor: routeColor,
      // A dashed route is drawn entirely by the repeating icon, so the solid
      // stroke underneath is made invisible.
      strokeOpacity: routeDashed ? 0 : 0.9,
      strokeWeight: 6,
      zIndex: 600,
      icons: routeDashed
        ? [
            {
              icon: {
                path: 'M 0,-1 0,1',
                strokeOpacity: 1,
                strokeColor: routeColor,
                scale: 3,
              },
              offset: '0',
              repeat: '14px',
            },
          ]
        : undefined,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, routeKey, routeColor, routeDashed])

  /** Keep the camera locked on the driver while navigating. */
  const wasFollowing = useRef(false)

  useEffect(() => {
    const instance = map.current
    if (!ready || !instance) return

    if (!follow) {
      wasFollowing.current = false
      return
    }
    if (meLat === undefined || meLng === undefined) return

    lastProgrammaticMove.current = Date.now()
    if (!wasFollowing.current) {
      wasFollowing.current = true
      instance.setZoom(followZoom)
    }
    instance.panTo({ lat: meLat, lng: meLng })
  }, [ready, follow, meLat, meLng, followZoom])

  // Rotate the camera to the direction of travel. Only meaningful on a vector
  // map — a raster map silently ignores `setHeading`, so it is gated rather
  // than faked.
  useEffect(() => {
    if (!ready) return
    const mapId = vectorRef.current ? resolveMapId() : null
    const rotation = rotationFor(heading, mapId)
    const instance = map.current
    if (desiredHeading.current !== rotation) headingAttempts.current = 0
    desiredHeading.current = rotation
    if (rotation === null || !instance) return
    exposeMapDebug('__PARKPILOT_ROTATION__', {
      heading,
      vector: vectorRef.current,
      mapId,
      rotation,
      renderingType: instance.getRenderingType(),
    })
    instance.setHeading(rotation)
  }, [ready, heading])

  /**
   * Keep the camera rotated while a heading is wanted.
   *
   * Google discards a heading applied while the vector map is still coming up,
   * so this re-asserts it. It runs on a timer rather than reacting to map
   * events precisely so it can never become a feedback loop — at most one
   * `setHeading` per tick — and it is a no-op when no heading is wanted, which
   * is every screen except active navigation.
   */
  useEffect(() => {
    if (!ready) return
    const id = window.setInterval(() => {
      const instance = map.current
      const want = desiredHeading.current
      if (!instance || want === null) return
      if (instance.getRenderingType() === 'RASTER') return
      const current = instance.getHeading() ?? 0
      if (Math.abs(current - want) <= 0.5) return
      if (headingAttempts.current >= MAX_HEADING_ATTEMPTS) return
      headingAttempts.current += 1
      instance.setHeading(want)
    }, 1000)
    return () => window.clearInterval(id)
  }, [ready])

  if (failed) {
    return (
      <div
        className={cn(
          'flex items-center justify-center bg-map p-6 text-center',
          className,
        )}
      >
        <p className="max-w-[240px] text-xs font-medium text-ink-muted">
          Map unavailable. Set a Google Maps API key to enable the map.
        </p>
      </div>
    )
  }

  return (
    <div className={cn('relative', className)}>
      <div ref={container} className="h-full w-full bg-map" />
      {interactive && me && showRecenter ? (
        <button
          type="button"
          aria-label="Recenter on my location"
          onClick={() => {
            map.current?.panTo(me)
            map.current?.setZoom(16)
          }}
          className="absolute right-3 bottom-3 flex size-10 items-center justify-center rounded-full bg-surface-raised shadow-sm shadow-black/10"
        >
          <LocateFixed className="size-[18px] text-ink" />
        </button>
      ) : null}
    </div>
  )
}
