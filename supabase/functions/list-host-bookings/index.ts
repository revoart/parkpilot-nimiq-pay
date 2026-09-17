import { createClient } from 'npm:@supabase/supabase-js@2'

import { readToken, verifyToken } from '../_shared/auth.ts'
import { errorResponse, json, preflight } from '../_shared/http.ts'

interface Body {
  nimiq_address?: string
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

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Identity comes from the signed-in token, never from the request body —
    // otherwise anyone could read any host's bookings by naming them.
    const owner = await verifyToken(readToken(request, body))
    if (!owner) {
      return errorResponse(
        request,
        'Sign in with your account to continue.',
        401,
      )
    }

    const ownerKey = owner.toLowerCase()

    const { data: spaces, error: spaceError } = await supabase
      .from('parking_spaces')
      .select('id')
      .ilike('owner_nimiq_address', ownerKey)

    if (spaceError) throw spaceError

    const ids = (spaces ?? []).map((space) => space.id)
    if (ids.length === 0) {
      return json(request, { bookings: [] })
    }

    const { data, error } = await supabase
      .from('reservations')
      .select(
        'id, parking_space_id, nimiq_address, start_at, end_at, amount_nim, status, created_at, parking_spaces ( title, address, image_url ), payments ( status, tx_hash, amount_nim, confirmed_at )',
      )
      .in('parking_space_id', ids)
      .order('start_at', { ascending: false })
      .limit(100)

    if (error) throw error

    return json(request, { bookings: data ?? [] })
  } catch (error) {
    console.error('list-host-bookings failed', error)
    return errorResponse(
      request,
      error instanceof Error ? error.message : 'Unexpected error',
      500,
    )
  }
})
