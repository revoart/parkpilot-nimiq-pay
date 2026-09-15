import { createClient } from 'npm:@supabase/supabase-js@2'

import { readToken, verifyToken } from '../_shared/auth.ts'
import { errorResponse, json, preflight } from '../_shared/http.ts'

const PARKING_TYPES = ['garage', 'underground', 'lot', 'street']

interface Body {
  evm_address?: string
  title?: string
  address?: string
  latitude?: number
  longitude?: number
  price_usdt?: number | string
  parking_type?: string
  description?: string | null
  covered?: boolean
  ev_charging?: boolean
  accessible?: boolean
  image_url?: string
}

Deno.serve(async (request) => {
  const options = preflight(request)
  if (options) return options
  if (request.method !== 'POST') {
    return errorResponse(request, 'Method not allowed', 405)
  }

  try {
    const body = (await request.json().catch(() => null)) as Body | null
    if (!body) return errorResponse(request, 'Invalid JSON body.')
    const title = (body.title ?? '').trim()
    const address = (body.address ?? '').trim()
    if (title.length < 3 || title.length > 120) {
      return errorResponse(request, 'Title must be 3-120 characters.')
    }
    if (address.length < 5 || address.length > 200) {
      return errorResponse(request, 'Address must be 5-200 characters.')
    }

    const latitude = Number(body.latitude)
    const longitude = Number(body.longitude)
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      return errorResponse(request, 'Invalid latitude.')
    }
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      return errorResponse(request, 'Invalid longitude.')
    }

    const price = Number(body.price_usdt)
    if (!Number.isFinite(price) || price <= 0 || price > 100000) {
      return errorResponse(request, 'Price must be greater than 0.')
    }

    const parkingType =
      body.parking_type && PARKING_TYPES.includes(body.parking_type)
        ? body.parking_type
        : 'lot'

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const owner = await verifyToken(readToken(request, body))
    if (!owner) {
      return errorResponse(
        request,
        'Sign in with your wallet to continue.',
        401,
      )
    }

    // Exactly one photo is mandatory, and it must be one this host uploaded —
    // the object has to live under the caller's own storage prefix.
    const imageUrl = (body.image_url ?? '').trim()
    const expectedPrefix = `${Deno.env.get(
      'SUPABASE_URL',
    )}/storage/v1/object/public/parking-photos/${owner.toLowerCase()}/`
    if (!imageUrl || !imageUrl.startsWith(expectedPrefix)) {
      return errorResponse(request, 'A parking photo is required.', 400)
    }

    const { data, error } = await supabase
      .from('parking_spaces')
      .insert({
        title,
        address,
        latitude,
        longitude,
        price_usdt: price.toFixed(6),
        description: body.description?.trim() || null,
        payment_recipient_address: owner,
        owner_evm_address: owner,
        parking_type: parkingType,
        covered: Boolean(body.covered),
        ev_charging: Boolean(body.ev_charging),
        accessible: Boolean(body.accessible),
        image_url: imageUrl,
        active: true,
      })
      .select('*')
      .single()

    if (error || !data) throw error ?? new Error('Failed to create parking space')

    return json(request, { parking_space: data })
  } catch (error) {
    console.error('create-parking-space failed', error)
    return errorResponse(
      request,
      error instanceof Error ? error.message : 'Unexpected error',
      500,
    )
  }
})
