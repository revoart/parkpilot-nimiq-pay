import { createClient } from 'npm:@supabase/supabase-js@2'

import { isValidNimiqAddress } from '../_shared/nimiq.ts'
import { errorResponse, json, preflight } from '../_shared/http.ts'

interface Body {
  evm_address?: string
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
    if (!isValidNimiqAddress(body.evm_address)) {
      return errorResponse(request, 'Invalid Nimiq address.')
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const owner = body.evm_address.toLowerCase()

    const { data: spaces, error: spaceError } = await supabase
      .from('parking_spaces')
      .select('id')
      .ilike('owner_evm_address', owner)

    if (spaceError) throw spaceError

    const ids = (spaces ?? []).map((space) => space.id)
    if (ids.length === 0) {
      return json(request, { bookings: [] })
    }

    const { data, error } = await supabase
      .from('reservations')
      .select(
        'id, parking_space_id, evm_address, start_at, end_at, amount_nim, status, created_at, parking_spaces ( title, address, image_url ), payments ( status, tx_hash, amount_nim, confirmed_at )',
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
