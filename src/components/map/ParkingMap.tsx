import { GoogleMap, type MapPoint } from '@/components/map/GoogleMap'
import type { ParkingSpace } from '@/types'
import type { LatLng } from '@/utils/geo'

interface ParkingMapProps {
  spaces: ParkingSpace[]
  center?: LatLng
  userLocation?: LatLng | null
  selectedId?: string | null
  onSelect?: (space: ParkingSpace) => void
  /** Draws the driver's destination alongside the parking pins. */
  destination?: LatLng | null
  /** Walking route geometry between parking and destination. */
  walkPath?: LatLng[] | null
  /** Fires when the map settles so the caller can offer "search this area". */
  onCenterChange?: (center: LatLng) => void
  /** Fires when the user drags the map (so UI can get out of the way). */
  onDragStart?: () => void
  /** Pixels of the map's bottom covered by app UI, so pins clear it. */
  bottomInset?: number
  className?: string
}

/** Listings map: Google Maps with price pins, the live location dot and tap-to-select. */
export function ParkingMap({
  spaces,
  center,
  userLocation,
  selectedId,
  onSelect,
  destination = null,
  walkPath = null,
  onCenterChange,
  onDragStart,
  bottomInset = 0,
  className,
}: ParkingMapProps) {
  const points: MapPoint[] = spaces.map((space) => ({
    id: space.id,
    lat: space.latitude,
    lng: space.longitude,
    label: `$${Number(space.price_usdt).toFixed(2)}`,
  }))

  return (
    <GoogleMap
      className={className}
      points={points}
      selectedId={selectedId}
      onSelect={(id) => {
        const space = spaces.find((item) => item.id === id)
        if (space) onSelect?.(space)
      }}
      center={center}
      me={userLocation}
      destination={destination}
      walkPath={walkPath}
      onCenterChange={onCenterChange}
      onDragStart={onDragStart}
      bottomInset={bottomInset}
      zoom={14}
    />
  )
}
