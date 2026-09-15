import { useCallback, useEffect, useRef, useState } from 'react'

import type { LatLng } from '@/utils/geo'

interface UseGeolocationResult {
  coords: LatLng | null
  loading: boolean
  error: string | null
  /** The browser exposes a Geolocation API at all. */
  supported: boolean
  /** Geolocation is only available on HTTPS (or localhost). */
  secure: boolean
  request: () => void
  watch: () => void
  stop: () => void
}

function errorMessage(error: GeolocationPositionError): string {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return 'Location permission was denied. Enable it for Nimiq Pay in your phone settings.'
    case error.POSITION_UNAVAILABLE:
      return 'Your location is unavailable right now. Try again in a moment.'
    case error.TIMEOUT:
      return 'Getting your location timed out. Try again.'
    default:
      return 'Could not get your location.'
  }
}

export function useGeolocation(): UseGeolocationResult {
  const [coords, setCoords] = useState<LatLng | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const watchId = useRef<number | null>(null)

  const supported =
    typeof navigator !== 'undefined' && 'geolocation' in navigator
  const secure =
    typeof window !== 'undefined' ? window.isSecureContext : false

  const guard = useCallback((): boolean => {
    if (!supported) {
      setError('Location is not available on this device.')
      return false
    }
    if (!secure) {
      setError(
        'Location needs a secure connection. Open the app over https (or localhost) to use your location.',
      )
      return false
    }
    return true
  }, [supported, secure])

  const onSuccess = useCallback((position: GeolocationPosition) => {
    setCoords({
      lat: position.coords.latitude,
      lng: position.coords.longitude,
    })
    setLoading(false)
    setError(null)
  }, [])

  const request = useCallback(() => {
    if (!guard()) return

    setLoading(true)
    setError(null)

    navigator.geolocation.getCurrentPosition(
      onSuccess,
      (positionError) => {
        setError(errorMessage(positionError))
        setLoading(false)
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 },
    )
  }, [guard, onSuccess])

  /** Continuously track the user's location (live map dot). */
  const watch = useCallback(() => {
    if (!guard()) return
    if (watchId.current !== null) return

    setLoading(true)
    watchId.current = navigator.geolocation.watchPosition(
      onSuccess,
      (positionError) => {
        setError(errorMessage(positionError))
        setLoading(false)
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 5_000 },
    )
  }, [guard, onSuccess])

  const stop = useCallback(() => {
    if (watchId.current !== null && supported) {
      navigator.geolocation.clearWatch(watchId.current)
      watchId.current = null
    }
  }, [supported])

  useEffect(() => () => stop(), [stop])

  return { coords, loading, error, supported, secure, request, watch, stop }
}
