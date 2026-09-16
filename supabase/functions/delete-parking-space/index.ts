import { createClient } from 'npm:@supabase/supabase-js@2'

import { readToken, verifyToken } from '../_shared/auth.ts'
import { errorResponse, json, preflight } from '../_shared/http.ts'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface Body {
  nimiq_address?: string
  id?: string
}

/**
 * Deletes a host's parking space. Blocked when the space has bookings, because
 * reservations reference it with ON DELETE RESTRICT. Hosts should pause the
 * listing instead.
 */
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
      .select('id, image_url')
      .eq('id', body.id)
      .ilike('owner_nimiq_address', owner)
      .maybeSingle()

    if (findError) throw findError
    if (!existing) {
      return errorResponse(request, 'Parking space not found.', 404)
    }

    const { count, error: countError } = await supabase
      .from('reservations')
      .select('id', { count: 'exact', head: true })
      .eq('parking_space_id', body.id)

    if (countError) throw countError

    if ((count ?? 0) > 0) {
      return errorResponse(
        request,
        'This listing has bookings and cannot be deleted. Pause it instead.',
        409,
      )
    }

    const { data: deleted, error: deleteError } = await supabase
      .from('parking_spaces')
      .delete()
      .eq('id', body.id)
      .select('id')

    if (deleteError) throw deleteError
    // Safety: never report success unless exactly one row was removed.
    if (!deleted || deleted.length !== 1) {
      return errorResponse(
        request,
        'Expected to delete exactly one listing.',
        500,
      )
    }

    // Clean up the listing's photo so storage does not accumulate orphans.
    const imageUrl = existing.image_url as string | null
    if (imageUrl) {
      const marker = '/storage/v1/object/public/parking-photos/'
      const index = imageUrl.indexOf(marker)
      if (index !== -1) {
        const path = imageUrl.slice(index + marker.length).split('?')[0]
        if (path) {
          await supabase.storage.from('parking-photos').remove([path])
        }
      }
    }

    return json(request, { deleted: true, id: deleted[0].id })
  } catch (error) {
    console.error('delete-parking-space failed', error)
    return errorResponse(
      request,
      error instanceof Error ? error.message : 'Unexpected error',
      500,
    )
  }
})
