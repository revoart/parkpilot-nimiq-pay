import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useLiveLocation } from '@/hooks/useLiveLocation'
import { useVoiceGuidance, type VoiceGuidanceResult } from '@/hooks/useVoiceGuidance'
import {
  cumulativeDistances,
  formatTurnDistance,
  getDrivingRoute,
  getWalkRoute,
  routeProgress,
  segmentLengthMeters,
  type Route,
  type RouteProgress,
} from '@/lib/routing'
import type { LatLng } from '@/utils/geo'

export type NavigationLeg = 'drive' | 'walk'

/** Explicit navigation states — no scattered booleans. */
export type NavigationPhase =
  | 'idle'
  | 'locating'
  | 'route-loading'
  | 'route-ready'
  | 'navigating'
  | 'rerouting'
  | 'arrived'
  | 'walking-route-ready'
  | 'walking'
  | 'destination-arrived'
  | 'location-denied'
  | 'route-error'

/** How far off the line counts as leaving the route. */
const OFF_ROUTE_METERS: Record<NavigationLeg, number> = { drive: 65, walk: 45 }

/** How close to the target counts as arrived. */
const ARRIVAL_METERS: Record<NavigationLeg, number> = { drive: 45, walk: 30 }

/** Consecutive off-route fixes before we reroute, and the cooldown after. */
const OFF_ROUTE_STREAK = 2
const REROUTE_COOLDOWN_MS = 12_000

/** Distances (metres) at which an instruction is spoken, furthest first. */
const ANNOUNCE_AT: Record<NavigationLeg, number[]> = {
  drive: [400, 150, 45],
  walk: [120, 30],
}

function coordKey(point: LatLng | null, digits: number): string {
  return point ? `${point.lat.toFixed(digits)},${point.lng.toFixed(digits)}` : ''
}

/**
 * Lowercase the first word only when the instruction starts with a verb, so
 * "In 250 m, turn right onto King St W" reads naturally while proper nouns
 * such as "Spadina Rd turns right" are left alone.
 */
const VERB_STARTS = new Set([
  'turn',
  'head',
  'continue',
  'keep',
  'slight',
  'sharp',
  'merge',
  'take',
  'exit',
  'make',
  'at',
  'in',
  'after',
  'then',
  'follow',
  'drive',
  'walk',
  'bear',
  'go',
  'use',
  'cross',
  'pass',
  'arrive',
  'you',
  'enter',
  'leave',
  'stay',
  'proceed',
  'board',
  'onto',
  'get',
])

function spokenInstruction(instruction: string): string {
  const match = /^([A-Za-z']+)/.exec(instruction)
  if (!match) return instruction
  if (!VERB_STARTS.has(match[1].toLowerCase())) return instruction
  return instruction.charAt(0).toLowerCase() + instruction.slice(1)
}

export interface UseNavigationOptions {
  /** The parking space — the driving destination. */
  parking: LatLng | null
  /** The driver's real destination — the walking destination. */
  destination: LatLng | null
  leg: NavigationLeg
  /** Only track and route while the navigation screen is mounted. */
  enabled: boolean
}

export interface NavigationResult {
  phase: NavigationPhase
  leg: NavigationLeg
  route: Route | null
  progress: RouteProgress | null
  position: LatLng | null
  heading: number | null
  speedMps: number | null
  accuracyMeters: number | null
  locationStatus: ReturnType<typeof useLiveLocation>['status']
  locationError: string | null
  routeError: string | null
  /** Instruction for the maneuver being approached. */
  instruction: string | null
  maneuver: string
  metersToManeuver: number
  nextInstruction: string | null
  /** Remaining seconds, rescaled live as the driver progresses. */
  etaSeconds: number | null
  remainingMeters: number
  distanceToTargetMeters: number | null
  isOffRoute: boolean
  isActive: boolean
  voice: VoiceGuidanceResult
  recalculate: () => void
  stop: () => void
}

/**
 * The ParkPilot navigation engine.
 *
 * Owns the route for one leg of the journey (drive → parking, or walk →
 * destination), tracks the live position, detects off-course travel and
 * arrival, and asks the voice layer to speak at sensible distances. It never
 * re-requests a route on every GPS fix.
 */
export function useNavigation({
  parking,
  destination,
  leg,
  enabled,
}: UseNavigationOptions): NavigationResult {
  const location = useLiveLocation()
  const voice = useVoiceGuidance()

  const {
    position,
    heading,
    speedMps,
    accuracyMeters,
    status: locationStatus,
    error: locationError,
    start: startLocation,
    stop: stopLocation,
  } = location

  const [route, setRoute] = useState<Route | null>(null)
  const [progress, setProgress] = useState<RouteProgress | null>(null)
  const [phase, setPhase] = useState<NavigationPhase>('idle')
  const [routeError, setRouteError] = useState<string | null>(null)
  const [routeNonce, setRouteNonce] = useState(0)

  /** The origin the current route was built from — frozen until a reroute. */
  const [routingOrigin, setRoutingOrigin] = useState<LatLng | null>(null)

  const cumulativeRef = useRef<number[]>([])
  const announcedRef = useRef(new Set<string>())
  const offRouteStreak = useRef(0)
  const lastRerouteAt = useRef(0)

  const parkingKey = coordKey(parking, 5)
  const destinationKey = coordKey(destination, 5)
  const positionKey = coordKey(position, 4)
  const routingOriginKey = coordKey(routingOrigin, 4)

  const target = leg === 'drive' ? parking : destination

  // --- Location tracking -----------------------------------------------------
  useEffect(() => {
    if (!enabled) {
      stopLocation()
      return
    }
    startLocation()
    return () => stopLocation()
  }, [enabled, startLocation, stopLocation])

  // --- Choose the origin for the next route ----------------------------------
  useEffect(() => {
    if (!enabled) {
      setRoutingOrigin(null)
      return
    }
    if (leg === 'walk') {
      setRoutingOrigin(parking)
      return
    }
    if (!position) return
    // Freeze the first fix; reroutes move it explicitly.
    setRoutingOrigin((current) => current ?? position)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, leg, parkingKey, positionKey])

  // --- Build the route -------------------------------------------------------
  useEffect(() => {
    if (!enabled) {
      setRoute(null)
      setProgress(null)
      setPhase('idle')
      return
    }

    if (!routingOrigin) {
      setPhase('locating')
      return
    }

    if (!target) {
      setRoute(null)
      setPhase('route-error')
      setRouteError('Choose a destination first.')
      return
    }

    let active = true
    setRouteError(null)
    setPhase((current) =>
      current === 'navigating' || current === 'walking'
        ? 'rerouting'
        : 'route-loading',
    )

    const run =
      leg === 'drive'
        ? getDrivingRoute(routingOrigin, target, { force: true })
        : getWalkRoute(routingOrigin, target)

    run
      .then((value) => {
        if (!active) return
        cumulativeRef.current = cumulativeDistances(value.path)
        announcedRef.current.clear()
        offRouteStreak.current = 0
        setRoute(value)
        setPhase(leg === 'drive' ? 'route-ready' : 'walking-route-ready')
      })
      .catch(() => {
        if (!active) return
        setPhase('route-error')
        setRouteError('Route unavailable.')
      })

    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    enabled,
    leg,
    routingOriginKey,
    parkingKey,
    destinationKey,
    routeNonce,
  ])

  // --- Auto-start once the route and a position are both available -----------
  useEffect(() => {
    if (!enabled) return
    if (phase === 'route-ready' && route && position) setPhase('navigating')
    if (phase === 'walking-route-ready' && route) setPhase('walking')
  }, [enabled, phase, route, position])

  // --- Surface a denied location (driving cannot proceed without it) ---------
  useEffect(() => {
    if (!enabled || leg !== 'drive') return
    if (locationStatus === 'denied' || locationStatus === 'unsupported') {
      setPhase('location-denied')
    }
  }, [enabled, leg, locationStatus])

  const recalculate = useCallback(() => {
    if (position) setRoutingOrigin(position)
    setRouteNonce((value) => value + 1)
  }, [position])

  const stop = useCallback(() => {
    stopLocation()
    voice.cancel()
    setPhase('idle')
    setRoute(null)
    setProgress(null)
    cumulativeRef.current = []
    announcedRef.current.clear()
  }, [stopLocation, voice])

  // --- Progress, arrival, off-course and voice ------------------------------
  useEffect(() => {
    if (!enabled || !route || !position) return
    if (cumulativeRef.current.length !== route.path.length) return

    const next = routeProgress(route, cumulativeRef.current, position)
    if (!next) return
    setProgress(next)

    const active = phase === 'navigating' || phase === 'walking'
    if (!active) return

    const distanceToTarget = target
      ? segmentLengthMeters(position, target)
      : Number.POSITIVE_INFINITY

    if (
      next.remainingMeters <= ARRIVAL_METERS[leg] ||
      distanceToTarget <= ARRIVAL_METERS[leg]
    ) {
      setPhase(leg === 'drive' ? 'arrived' : 'destination-arrived')
      voice.speak(
        leg === 'drive'
          ? 'You have arrived at your parking destination.'
          : 'You have arrived at your destination.',
        { force: true },
      )
      return
    }

    // Off-course detection is a driving concern; walking may wander freely.
    if (leg === 'drive') {
      if (next.offRouteMeters > OFF_ROUTE_METERS.drive) {
        offRouteStreak.current += 1
        if (
          offRouteStreak.current >= OFF_ROUTE_STREAK &&
          Date.now() - lastRerouteAt.current > REROUTE_COOLDOWN_MS
        ) {
          offRouteStreak.current = 0
          lastRerouteAt.current = Date.now()
          voice.speak('Recalculating route.', { force: true })
          recalculate()
          return
        }
      } else {
        offRouteStreak.current = 0
      }
    }

    // Speak only when the driver crosses into a closer announcement band.
    const step = next.step
    if (!step) return

    const thresholds = ANNOUNCE_AT[leg]
    let band = -1
    for (let index = 0; index < thresholds.length; index += 1) {
      if (next.metersToStepEnd <= thresholds[index]) band = index
    }
    if (band < 0) return

    const key = `${next.stepIndex}:${band}`
    if (announcedRef.current.has(key)) return
    announcedRef.current.add(key)

    if (band === thresholds.length - 1) {
      voice.speak(step.instruction)
    } else {
      voice.speak(
        `In ${formatTurnDistance(next.metersToStepEnd)}, ${spokenInstruction(step.instruction)}`,
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, route, positionKey, phase, leg, parkingKey, destinationKey])

  const etaSeconds = useMemo(() => {
    if (!route) return null
    if (!progress) return route.durationSeconds
    const fraction = Math.max(0, Math.min(1, 1 - progress.fraction))
    return Math.round(route.durationSeconds * fraction)
  }, [route, progress])

  const distanceToTargetMeters = useMemo(() => {
    if (!position || !target) return null
    return segmentLengthMeters(position, target)
  }, [position, target])

  return {
    phase,
    leg,
    route,
    progress,
    position,
    heading,
    speedMps,
    accuracyMeters,
    locationStatus,
    locationError,
    routeError,
    instruction: progress?.step?.instruction ?? null,
    maneuver: progress?.step?.maneuver ?? '',
    metersToManeuver: progress?.metersToStepEnd ?? 0,
    nextInstruction: progress?.nextStep?.instruction ?? null,
    etaSeconds,
    remainingMeters: progress?.remainingMeters ?? route?.distanceMeters ?? 0,
    distanceToTargetMeters,
    isOffRoute: (progress?.offRouteMeters ?? 0) > OFF_ROUTE_METERS[leg],
    isActive: phase === 'navigating' || phase === 'walking',
    voice,
    recalculate,
    stop,
  }
}
