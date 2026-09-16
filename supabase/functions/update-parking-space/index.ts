import { createClient } from 'npm:@supabase/supabase-js@2'

import { readToken, verifyToken } from '../_shared/auth.ts'
import { errorResponse, json, preflight } from '../_shared/http.ts'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PARKING_TYPES = ['garage', 'underground', 'lot', 'street']

interface Body {
  nimiq_address?: string
  id?: string
  title?: string
  address?: string
  price_nim?: number | string
  parking_type?: string
  description?: string | null
  covered?: boolean
  ev_charging?: boolean
  accessible?: boolean
  active?: boolean
  image_url?: string | null
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
    if (!body.id || !UUID_RE.test(body.id)) {
      return errorResponse(request, 'Invalid parking space id.')
    }

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

    const { data: existing, error: findError } = await supabase
      .from('parking_spaces')
      .select('id, active, image_url')
      .eq('id', body.id)
      .ilike('owner_nimiq_address', owner)
      .maybeSingle()

    if (findError) throw findError
    if (!existing) {
      return errorResponse(request, 'Parking space not found.', 404)
    }

    const update: Record<string, unknown> = {}

    if (body.title !== undefined) {
      const title = body.title.trim()
      if (title.length < 3 || title.length > 120) {
        return errorResponse(request, 'Title must be 3-120 characters.')
      }
      update.title = title
    }
    if (body.address !== undefined) {
      const address = body.address.trim()
      if (address.length < 5 || address.length > 200) {
        return errorResponse(request, 'Address must be 5-200 characters.')
      }
      update.address = address
    }
    if (body.price_nim !== undefined) {
      const price = Number(body.price_nim)
      if (!Number.isFinite(price) || price <= 0 || price > 100000) {
        return errorResponse(request, 'Price must be greater than 0.')
      }
      update.price_nim = price.toFixed(6)
    }
    if (
      body.parking_type !== undefined &&
      PARKING_TYPES.includes(body.parking_type)
    ) {
      update.parking_type = body.parking_type
    }
    if (body.description !== undefined) {
      update.description = body.description?.trim() || null
    }
    if (body.covered !== undefined) update.covered = Boolean(body.covered)
    if (body.ev_charging !== undefined) {
      update.ev_charging = Boolean(body.ev_charging)
    }
    if (body.accessible !== undefined) {
      update.accessible = Boolean(body.accessible)
    }
    if (body.active !== undefined) update.active = Boolean(body.active)

    if (body.image_url !== undefined) {
      const nextImage = (body.image_url ?? '').trim()
      // An active listing must always keep exactly one photo.
      const willBeActive =
        body.active !== undefined ? Boolean(body.active) : Boolean(existing.active)
      if (!nextImage && willBeActive) {
        return errorResponse(
          request,
          'An active listing must keep a photo. Upload a replacement first.',
          400,
        )
      }
      if (nextImage) {
        const expectedPrefix = `${Deno.env.get(
          'SUPABASE_URL',
        )}/storage/v1/object/public/parking-photos/${owner.toLowerCase()}/`
        if (!nextImage.startsWith(expectedPrefix)) {
          return errorResponse(request, 'Invalid image URL.', 400)
        }
      }
      update.image_url = nextImage || null
    }

    if (Object.keys(update).length === 0) {
      return errorResponse(request, 'Nothing to update.')
    }

    const { data, error } = await supabase
      .from('parking_spaces')
      .update(update)
      .eq('id', body.id)
      .select('*')
      .single()

    if (error || !data) throw error ?? new Error('Failed to update parking space')

    return json(request, { parking_space: data })
  } catch (error) {
    console.error('update-parking-space failed', error)
    return errorResponse(
      request,
      error instanceof Error ? error.message : 'Unexpected error',
      500,
    )
  }
})
