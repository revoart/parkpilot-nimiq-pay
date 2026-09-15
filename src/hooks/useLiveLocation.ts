import { useCallback, useEffect, useRef, useState } from 'react'

import type { LatLng } from '@/utils/geo'

export type LocationStatus =
  | 'idle'
  | 'locating'
  | 'ready'
  | 'denied'
  | 'unavailable'
  | 'timeout'
  | 'unsupported'
  | 'insecure'

export interface LiveLocationResult {
  position: LatLng | null
  /** Degrees clockwise from north, when the device reports it. */
  heading: number | null
  /** Metres per second, when the device reports it. */
  speedMps: number | null
  accuracyMeters: number | null
  timestamp: number | null
  status: LocationStatus
  error: string | null
  supported: boolean
  secure: boolean
  start: () => void
  stop: () => void
}

/** Ignore bursts of fixes closer together than this. */
const MIN_INTERVAL_MS = 900

function messageFor(status: LocationStatus): string | null {
  switch (status) {
    case 'denied':
      return 'Location access is needed for live navigation.'
    case 'unavailable':
      return 'Unable to determine your current location.'
    case 'timeout':
      return 'Getting your location timed out.'
    case 'unsupported':
      return 'This device does not support location.'
    case 'insecure':
      return 'Location needs a secure connection. Open the app over https.'
    default:
      return null
  }
}

function statusFromError(error: GeolocationPositionError): LocationStatus {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return 'denied'
    case error.POSITION_UNAVAILABLE:
      return 'unavailable'
    case error.TIMEOUT:
      return 'timeout'
    default:
      return 'unavailable'
  }
}

/**
 * Live position for navigation: heading, speed and accuracy included, and
 * deliberately throttled so a chatty GPS chip cannot thrash React.
 */
export function useLiveLocation(): LiveLocationResult {
  const [position, setPosition] = useState<LatLng | null>(null)
  const [heading, setHeading] = useState<number | null>(null)
  const [speedMps, setSpeedMps] = useState<number | null>(null)
  const [accuracyMeters, setAccuracyMeters] = useState<number | null>(null)
  const [timestamp, setTimestamp] = useState<number | null>(null)
  const [status, setStatus] = useState<LocationStatus>('idle')

  const watchId = useRef<number | null>(null)
  const lastAccepted = useRef(0)

  const supported =
    typeof navigator !== 'undefined' && 'geolocation' in navigator
  const secure = typeof window !== 'undefined' ? window.isSecureContext : false

  const stop = useCallback(() => {
    if (watchId.current !== null && supported) {
      navigator.geolocation.clearWatch(watchId.current)
      watchId.current = null
    }
  }, [supported])

  const start = useCallback(() => {
    if (!supported) {
      setStatus('unsupported')
      return
    }
    if (!secure) {
      setStatus('insecure')
      return
    }
    if (watchId.current !== null) return

    setStatus((current) => (current === 'ready' ? current : 'locating'))

    watchId.current = navigator.geolocation.watchPosition(
      (update) => {
        const now = Date.now()
        // Always accept the first fix; then throttle.
        if (lastAccepted.current !== 0 && now - lastAccepted.current < MIN_INTERVAL_MS) {
          return
        }
        lastAccepted.current = now

        const { coords } = update
        setPosition({ lat: coords.latitude, lng: coords.longitude })
        setHeading(
          typeof coords.heading === 'number' && !Number.isNaN(coords.heading)
            ? coords.heading
            : null,
        )
        setSpeedMps(
          typeof coords.speed === 'number' && !Number.isNaN(coords.speed)
            ? coords.speed
            : null,
        )
        setAccuracyMeters(
          typeof coords.accuracy === 'number' ? coords.accuracy : null,
        )
        setTimestamp(update.timestamp)
        setStatus('ready')
      },
      (error) => {
        setStatus(statusFromError(error))
      },
      {
        enableHighAccuracy: true,
        timeout: 15_000,
        maximumAge: 2_000,
      },
    )
  }, [secure, supported])

  useEffect(() => () => stop(), [stop])

  return {
    position,
    heading,
    speedMps,
    accuracyMeters,
    timestamp,
    status,
    error: messageFor(status),
    supported,
    secure,
    start,
    stop,
  }
}
