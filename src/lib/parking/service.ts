import { getSupabase } from '@/lib/supabase/client'
import type { Database } from '@/lib/supabase/database.types'
import type { NearbyParkingSpace, ParkingSpace } from '@/types'
import type { LatLng } from '@/utils/geo'

type ParkingSpaceRow = Database['public']['Tables']['parking_spaces']['Row']

function normalize(row: ParkingSpaceRow): ParkingSpace {
  return { ...row, price_nim: Number(row.price_nim) }
}

/** The discovery radius. Widening is an explicit driver action, never silent. */
export const NEARBY_RADIUS_M = 5000

/**
 * Listings within `radiusMeters` of a point, measured by the database.
 *
 * The radius is deliberately not applied in the browser: the previous version
 * fetched up to 100 listings and filtered them client-side, which meant
 * "within 5 km" was a guess and listings outside the radius still reached the
 * map. The RPC uses the (latitude, longitude) index for a bounding box and an
 * exact haversine to trim it to a true circle, and returns the measured
 * distance plus real availability state.
 */
export async function listNearbyParking(
  center: LatLng,
  radiusMeters: number = NEARBY_RADIUS_M,
): Promise<NearbyParkingSpace[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase.rpc('nearby_parking_spaces', {
    p_lat: center.lat,
    p_lng: center.lng,
    p_radius_m: Math.round(radiusMeters),
  })

  if (error) throw new Error(error.message)

  return (data ?? []).map((row) => ({
    ...row,
    price_nim: Number(row.price_nim),
    distance_m: Number(row.distance_m),
    rating_avg: row.rating_avg === null ? null : Number(row.rating_avg),
    rating_count: Number(row.rating_count ?? 0),
  }))
}

/**
 * Text search across listings. Used by the host tools and as a fallback when
 * there is no geographic centre to search around.
 */
export async function listParkingSpaces(
  search?: string,
): Promise<ParkingSpace[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('parking_spaces')
    .select('*')
    .eq('active', true)
    .order('price_nim', { ascending: true })
    .limit(100)

  if (error) throw new Error(error.message)

  const spaces = (data ?? []).map(normalize)
  const term = search?.trim().toLowerCase()
  if (!term) return spaces

  return spaces.filter((space) =>
    [space.title, space.address, space.description ?? '', space.parking_type ?? '']
      .join(' ')
      .toLowerCase()
      .includes(term),
  )
}

export async function getParkingSpace(id: string): Promise<ParkingSpace | null> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('parking_spaces')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data ? normalize(data) : null
}

export interface ReviewItem {
  id: string
  name: string
  rating: number
  comment: string | null
  createdAt: string
}

export interface ReviewSummary {
  average: number
  count: number
  reviews: ReviewItem[]
}

export async function getParkingReviews(
  parkingSpaceId: string,
): Promise<ReviewSummary> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('reviews')
    .select('*')
    .eq('parking_space_id', parkingSpaceId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)

  const rows = data ?? []
  const count = rows.length
  const average = count
    ? rows.reduce((sum, row) => sum + row.rating, 0) / count
    : 0

  return {
    average,
    count,
    reviews: rows.map((row) => ({
      id: row.id,
      name: row.reviewer_name ?? 'ParkPilot driver',
      rating: row.rating,
      comment: row.comment,
      createdAt: row.created_at,
    })),
  }
}

export function parkingTypeLabel(type: string | null): string {
  switch (type) {
    case 'garage':
      return 'Garage'
    case 'underground':
      return 'Underground'
    case 'lot':
      return 'Surface lot'
    case 'street':
      return 'Street parking'
    default:
      return 'Parking'
  }
}
