import { getSupabase } from '@/lib/supabase/client'
import type { Database } from '@/lib/supabase/database.types'
import type { ParkingSpace } from '@/types'

type ParkingSpaceRow = Database['public']['Tables']['parking_spaces']['Row']

function normalize(row: ParkingSpaceRow): ParkingSpace {
  return { ...row, price_usdt: Number(row.price_usdt) }
}

/**
 * The demo catalogue is small, so search is applied client-side. This avoids
 * building PostgREST filter strings from user input.
 */
export async function listParkingSpaces(
  search?: string,
): Promise<ParkingSpace[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('parking_spaces')
    .select('*')
    .eq('active', true)
    .order('price_usdt', { ascending: true })
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
