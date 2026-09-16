import { createClient } from 'npm:@supabase/supabase-js@2'

import { readToken, verifyToken } from '../_shared/auth.ts'
import { errorResponse, json, preflight } from '../_shared/http.ts'

interface Body {
  evm_address?: string
  auth_token?: string
}

/**
 * The shared ParkPilot identity (one identity for Driver and Host). Returns an
 * empty profile when the wallet has never saved one, so the client never has to
 * special-case a missing row.
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

    const owner = await verifyToken(readToken(request, body))
    if (!owner) {
      return errorResponse(request, 'Sign in with your wallet to continue.', 401)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data, error } = await supabase
      .from('profiles')
      .select(
        'display_name, bio, avatar_url, nmiq_address, evm_address, phone, phone_shared',
      )
      .ilike('evm_address', owner)
      .maybeSingle()

    if (error) throw error

    return json(request, {
      profile: {
        display_name: data?.display_name ?? null,
        bio: data?.bio ?? null,
        avatar_url: data?.avatar_url ?? null,
        nmiq_address: data?.nmiq_address ?? null,
        evm_address: data?.evm_address ?? owner,
        // The owner's own number, so it is returned regardless of the sharing
        // flag — they can always see and edit what they entered.
        phone: data?.phone ?? null,
        phone_shared: Boolean(data?.phone_shared),
      },
    })
  } catch (error) {
    console.error('get-profile failed', error)
    return errorResponse(
      request,
      error instanceof Error ? error.message : 'Unexpected error',
      500,
    )
  }
})
