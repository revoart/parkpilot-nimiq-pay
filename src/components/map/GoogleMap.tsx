/// <reference types="google.maps" />
import { useEffect, useRef, useState } from 'react'
import { LocateFixed } from 'lucide-react'

import { useTheme } from '@/hooks/useTheme'
import {
  easeAngleToward,
  easeToward,
  metersPerPixel,
  normalizeAngle,
  offsetAlongHeading,
} from '@/lib/maps/camera'
import {
  destinationIcon,
  dotIcon,
  fixedArrowIcon,
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
 * Time constants for the follow camera, in milliseconds.
 *
 * GPS fixes land about once a second while the screen redraws at 60fps, so
 * each fix is treated as a target rather than an instruction. The frame loop
 * eases toward it, which keeps motion continuous instead of jumping once a
 * second. Lower is snappier, higher is smoother.
 */
const CENTER_TAU_MS = 420
const HEADING_TAU_MS = 380
const ZOOM_TAU_MS = 500

/** Ignore a frame gap longer than this (a backgrounded tab) when easing. */
const MAX_FRAME_MS = 100

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
  /** Device heading in degrees — rotates the camera and, on raster, the arrow. */
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
   * panel). Used to pad `fitBounds` and to keep the followed position marker
   * clear of the panel.
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
 * Google Maps JavaScript API map.
 *
 * The camera is driven from a frame loop rather than directly from each GPS
 * fix, because fixes arrive about once a second and applying them straight to
 * the map produces a visible jump per fix. On a vector map the loop also
 * carries the heading, so the map rotates to the direction of travel.
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
  /** Last icon applied to each marker, so we only call `setIcon` on a change. */
  const markerIcons = useRef(new Map<string, unknown>())
  const meMarker = useRef<google.maps.Marker | null>(null)
  const meIcon = useRef<unknown>(null)
  const destinationMarker = useRef<google.maps.Marker | null>(null)
  const walkLine = useRef<google.maps.Polyline | null>(null)
  const routeLine = useRef<google.maps.Polyline | null>(null)
  /** True when the map is rendering vector tiles (a Map ID was accepted). */
  const vectorRef = useRef(false)
  const onCenterChangeRef = useRef(onCenterChange)
  const onDragStartRef = useRef(onDragStart)
  const bottomInsetRef = useRef(bottomInset)
  /** Timestamp of the last camera move we caused, so we can ignore its idle. */
  const lastProgrammaticMove = useRef(0)
  const onSelectRef = useRef(onSelect)
  const themeRef = useRef(theme)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(() => !isMapsConfigured())

  /** Target camera, set from the latest GPS fix. */
  const targetCenter = useRef<LatLng | null>(null)
  const targetHeading = useRef<number | null>(null)
  const targetZoom = useRef<number | null>(null)
  /** Eased camera actually applied each frame. */
  const camCenter = useRef<LatLng | null>(null)
  const camHeading = useRef<number | null>(null)
  const camZoom = useRef<number | null>(null)
  /** Reseed the eased camera the next time following starts. */
  const followSeeded = useRef(false)
  /** Polls until the renderer reports VECTOR or RASTER. */
  const renderTypeTimer = useRef<number | null>(null)
  /**
   * Set only while we are inside our own `moveCamera` call.
   *
   * `moveCamera` fires `heading_changed` synchronously, so a heading change
   * arriving while this is false came from a gesture rather than from us —
   * which is how a two-finger rotate is told apart from the follow camera
   * doing its job.
   */
  const writingCamera = useRef(false)
  /** True while the follow loop is driving the camera. */
  const cameraActive = useRef(false)

  useEffect(() => {
    onCenterChangeRef.current = onCenterChange
  }, [onCenterChange])

  useEffect(() => {
    onDragStartRef.current = onDragStart
  }, [onDragStart])

  useEffect(() => {
    bottomInsetRef.current = bottomInset
  }, [bottomInset])

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
    const markerIconMap = markerIcons.current
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

        map.current = instance

        // Optional debug handle (VITE_DEBUG_MAP=true) so camera state can be
        // asserted from automated checks instead of guessed from pixels.
        exposeMapDebug('__PARKPILOT_MAP__', instance)

        /**
         * Decide whether rotation is actually available.
         *
         * This deliberately reads the map's *real* rendering type rather than
         * trusting that a Map ID was supplied: a raster Map ID, a Map ID from
         * another project, or a browser without WebGL all leave the map on the
         * raster renderer, where `setHeading` is silently ignored. Assuming
         * vector from the mere presence of a Map ID would make the app claim a
         * rotation it cannot perform.
         */
        const settleRenderingType = (): boolean => {
          const type = instance.getRenderingType()
          if (type !== 'VECTOR' && type !== 'RASTER') return false
          vectorRef.current = type === 'VECTOR'
          exposeMapDebug('__PARKPILOT_RENDERING__', {
            type,
            mapId: mapId ?? null,
          })
          if (vectorRef.current) {
            // Two-finger rotate is allowed. While following, the camera owns
            // the heading — but a rotation the driver performs themselves is
            // treated as taking manual control, which stops the follow camera
            // from fighting the gesture. Tilt stays disabled entirely.
            instance.setHeadingInteractionEnabled(true)
            instance.setTiltInteractionEnabled(false)
          }
          return true
        }

        if (!settleRenderingType()) {
          // The renderer reports UNINITIALIZED until its WebGL context is up.
          let attempts = 0
          renderTypeTimer.current = window.setInterval(() => {
            attempts += 1
            if (settleRenderingType() || attempts > 40) {
              if (renderTypeTimer.current !== null) {
                window.clearInterval(renderTypeTimer.current)
                renderTypeTimer.current = null
              }
            }
          }, 250)
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

        // A two-finger rotate is the driver taking manual control, so the
        // follow camera must let go rather than snap the heading back. Only
        // meaningful while the camera is actually being driven: outside that,
        // gesture rotations are already left alone.
        instance.addListener('heading_changed', () => {
          if (writingCamera.current || !cameraActive.current) return
          onDragStartRef.current?.()
        })

        setReady(true)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })

    return () => {
      cancelled = true
      unsubscribe()
      if (renderTypeTimer.current !== null) {
        window.clearInterval(renderTypeTimer.current)
        renderTypeTimer.current = null
      }
      markerMap.forEach((marker) => marker.setMap(null))
      markerMap.clear()
      markerIconMap.clear()
      meMarker.current = null
      meIcon.current = null
      destinationMarker.current = null
      walkLine.current = null
      routeLine.current = null
      vectorRef.current = false
      followSeeded.current = false
      targetCenter.current = null
      camCenter.current = null
      camHeading.current = null
      camZoom.current = null
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

  const pointKey = points
    .map((p) => `${p.id}:${p.lat.toFixed(5)},${p.lng.toFixed(5)}`)
    .join('|')
  const centerKey = center ? `${center.lat.toFixed(5)},${center.lng.toFixed(5)}` : ''
  const destinationKey = destination
    ? `${destination.lat.toFixed(5)},${destination.lng.toFixed(5)}`
    : ''

  // Keep markers in sync. Keyed on the point geometry rather than running on
  // every render, and `setIcon` is skipped unless the icon actually changed —
  // rebuilding an icon allocates a fresh SVG data URL that the browser must
  // then decode, which is what made the map stutter while moving.
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

      const icon = iconFor(point, active)
      if (markerIcons.current.get(point.id) !== icon) {
        marker.setIcon(icon)
        markerIcons.current.set(point.id, icon)
      }
      marker.setZIndex(active ? 999 : 1)
    }

    for (const [id, marker] of markers.current) {
      if (!seen.has(id)) {
        marker.setMap(null)
        markers.current.delete(id)
        markerIcons.current.delete(id)
      }
    }
  }, [ready, pointKey, selectedId, points])

  // Frame the map when it is not following the driver. Skipped entirely while
  // following, because `fitBounds` resets the heading to zero — which would
  // silently undo the rotation on every re-frame.
  useEffect(() => {
    const instance = map.current
    if (!ready || !instance || follow) return

    const inset = bottomInsetRef.current
    const padding = { top: 80, right: 16, bottom: inset + 16, left: 16 }
    lastProgrammaticMove.current = Date.now()

    /** Shift a camera target up so it renders clear of the covered strip. */
    const padded = (target: LatLng): LatLng => {
      if (inset <= 0) return target
      const projection = instance.getProjection()
      const currentZoom = instance.getZoom()
      if (!projection || currentZoom === undefined) return target
      const point = projection.fromLatLngToPoint(new google.maps.LatLng(target))
      if (!point) return target
      // World units per pixel at this zoom is 1 / 2^zoom.
      const shifted = new google.maps.Point(
        point.x,
        point.y + inset / 2 / Math.pow(2, currentZoom),
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
  }, [ready, follow, selectedId, pointKey, centerKey, destinationKey])

  const meLat = me?.lat
  const meLng = me?.lng

  // Record the latest fix as the camera target. The frame loop below consumes
  // it, so this only ever stores values.
  useEffect(() => {
    if (!follow || meLat === undefined || meLng === undefined) return

    if (!followSeeded.current) {
      // Starting (or resuming) following: snap the eased camera to the driver
      // so the loop does not sweep in from wherever the map was left.
      followSeeded.current = true
      camCenter.current = { lat: meLat, lng: meLng }
      camHeading.current = targetHeading.current
      camZoom.current = followZoom
    }

    targetCenter.current = { lat: meLat, lng: meLng }
    targetZoom.current = followZoom
    if (heading !== null && Number.isFinite(heading)) {
      targetHeading.current = normalizeAngle(heading)
    }
  }, [follow, meLat, meLng, heading, followZoom])

  useEffect(() => {
    if (!follow) followSeeded.current = false
  }, [follow])

  // The follow camera. Runs every frame while following: eases the camera
  // toward the latest fix and applies centre, heading and zoom in one
  // `moveCamera` call, so they land in the same frame instead of fighting as
  // separate animations.
  useEffect(() => {
    if (!ready || !follow) return

    let raf = 0
    let last = 0
    cameraActive.current = true

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      const instance = map.current
      const target = targetCenter.current
      if (!instance || !target) return

      const dt = last ? Math.min(now - last, MAX_FRAME_MS) : 16
      last = now

      const wantedZoom = targetZoom.current ?? followZoom
      camZoom.current =
        camZoom.current === null
          ? wantedZoom
          : easeToward(camZoom.current, wantedZoom, dt, ZOOM_TAU_MS)

      if (targetHeading.current !== null) {
        camHeading.current =
          camHeading.current === null
            ? targetHeading.current
            : easeAngleToward(
                camHeading.current,
                targetHeading.current,
                dt,
                HEADING_TAU_MS,
              )
      }

      const rotation = rotationFor(
        camHeading.current,
        vectorRef.current ? resolveMapId() : null,
      )

      // Keep the driver clear of the panel covering the bottom of the map by
      // aiming the camera ahead of them along the direction of travel.
      const aim =
        rotation !== null
          ? offsetAlongHeading(
              target,
              rotation,
              metersPerPixel(target.lat, camZoom.current),
              bottomInsetRef.current / 2,
            )
          : target

      const current = camCenter.current ?? target
      camCenter.current = {
        lat: easeToward(current.lat, aim.lat, dt, CENTER_TAU_MS),
        lng: easeToward(current.lng, aim.lng, dt, CENTER_TAU_MS),
      }

      const camera: google.maps.CameraOptions = {
        center: camCenter.current,
        zoom: camZoom.current,
      }
      if (rotation !== null) camera.heading = rotation

      lastProgrammaticMove.current = Date.now()
      writingCamera.current = true
      instance.moveCamera(camera)
      writingCamera.current = false

      exposeMapDebug('__PARKPILOT_ROTATION__', {
        heading,
        targetHeading: targetHeading.current,
        easedHeading: camHeading.current,
        vector: vectorRef.current,
        mapId: vectorRef.current ? resolveMapId() : null,
        rotation,
        renderingType: instance.getRenderingType(),
      })
    }

    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      cameraActive.current = false
      writingCamera.current = false
    }
  }, [ready, follow, followZoom, heading])

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

    // On a vector map the camera carries the heading, so the marker is a fixed
    // arrow — rotating it as well would point it the wrong way. On a raster map
    // the arrow is the only heading indicator, so it rotates.
    const nextIcon =
      meVariant === 'arrow'
        ? vectorRef.current
          ? fixedArrowIcon()
          : headingIcon(heading)
        : dotIcon('#2563EB')
    if (meIcon.current !== nextIcon) {
      meMarker.current.setIcon(nextIcon)
      meIcon.current = nextIcon
    }
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
