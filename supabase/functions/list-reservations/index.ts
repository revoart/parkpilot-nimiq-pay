import { createClient } from 'npm:@supabase/supabase-js@2'

import { readToken, verifyToken } from '../_shared/auth.ts'
import { errorResponse, json, preflight } from '../_shared/http.ts'

interface ListReservationsBody {
  nimiq_address?: string
}

/** List a wallet's reservations, newest first. */
Deno.serve(async (request) => {
  const options = preflight(request)
  if (options) return options
  if (request.method !== 'POST') {
    return errorResponse(request, 'Method not allowed', 405)
  }

  try {
    const body = (await request.json().catch(() => null)) as
      | ListReservationsBody
      | null
    if (!body) return errorResponse(request, 'Invalid JSON body.')
    const owner = await verifyToken(readToken(request, body))
    if (!owner) {
      return errorResponse(
        request,
        'Sign in with your wallet to continue.',
        401,
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data, error } = await supabase
      .from('reservations')
      .select(
        'id, parking_space_id, nimiq_address, start_at, end_at, amount_nim, status, created_at, updated_at, parking_spaces ( id, title, address, latitude, longitude, parking_type, covered, ev_charging, accessible, image_url ), payments ( * )',
      )
      .eq('nimiq_address', owner)
      .order('start_at', { ascending: false })
      .limit(50)

    if (error) throw error

    return json(request, { reservations: data ?? [] })
  } catch (error) {
    console.error('list-reservations failed', error)
    return errorResponse(
      request,
      error instanceof Error ? error.message : 'Unexpected error',
      500,
    )
  }
})
