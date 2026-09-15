import { GoogleMap } from '@/components/map/GoogleMap'
import type { LatLng } from '@/utils/geo'

interface LocationMapProps {
  point: LatLng
  label?: string
  className?: string
}

/** Single-point Google map. */
export function LocationMap({ point, label, className }: LocationMapProps) {
  return (
    <GoogleMap
      className={className}
      points={[{ id: 'location', lat: point.lat, lng: point.lng, label, variant: 'pin' }]}
      center={point}
      zoom={16}
    />
  )
}
