export interface Place {
  id: string
  name: string
  address: string
  lat: number
  lng: number
}

/** Real Toronto destinations used for Home/Work shortcuts and recent places. */
export const TORONTO_PLACES: Place[] = [
  {
    id: 'union-station',
    name: 'Union Station',
    address: '65 Front St W, Toronto',
    lat: 43.6453,
    lng: -79.3806,
  },
  {
    id: 'eaton-centre',
    name: 'Toronto Eaton Centre',
    address: '220 Yonge St, Toronto',
    lat: 43.6544,
    lng: -79.3807,
  },
  {
    id: 'financial-district',
    name: 'Financial District',
    address: '100 King St W, Toronto',
    lat: 43.6487,
    lng: -79.3817,
  },
  {
    id: 'entertainment-district',
    name: 'Entertainment District',
    address: '325 King St W, Toronto',
    lat: 43.6448,
    lng: -79.3957,
  },
  {
    id: 'distillery-district',
    name: 'Distillery District',
    address: '55 Mill St, Toronto',
    lat: 43.6503,
    lng: -79.3596,
  },
  {
    id: 'harbourfront',
    name: 'Harbourfront Centre',
    address: '235 Queens Quay W, Toronto',
    lat: 43.6387,
    lng: -79.3817,
  },
]

export function findPlace(id: string | null): Place | null {
  if (!id) return null
  return TORONTO_PLACES.find((place) => place.id === id) ?? null
}
