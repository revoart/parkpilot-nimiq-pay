import { createClient } from 'npm:@supabase/supabase-js@2'

import { readToken, verifyToken } from '../_shared/auth.ts'
import { errorResponse, json, preflight } from '../_shared/http.ts'

interface Body {
  evm_address?: string
  auth_token?: string
  display_name?: string | null
  bio?: string | null
  avatar_url?: string | null
}

const MAX_NAME = 60
const MAX_BIO = 240

/**
 * Updates the single shared identity. Driver and Host read the same row, so a
 * name/bio/avatar change is immediately visible in both modes.
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
    const ownerAddress = owner.toLowerCase()

    const update: Record<string, unknown> = { evm_address: ownerAddress }

    if (body.display_name !== undefined) {
      const name = (body.display_name ?? '').trim()
      if (name.length > MAX_NAME) {
        return errorResponse(request, `Name must be ${MAX_NAME} characters or fewer.`)
      }
      update.display_name = name || null
    }

    if (body.bio !== undefined) {
      const bio = (body.bio ?? '').trim()
      if (bio.length > MAX_BIO) {
        return errorResponse(request, `Bio must be ${MAX_BIO} characters or fewer.`)
      }
      update.bio = bio || null
    }

    if (body.avatar_url !== undefined) {
      const avatar = (body.avatar_url ?? '').trim()
      if (avatar) {
        const expectedPrefix = `${Deno.env.get(
          'SUPABASE_URL',
        )}/storage/v1/object/public/parking-photos/avatars/${ownerAddress}/`
        if (!avatar.startsWith(expectedPrefix)) {
          return errorResponse(request, 'Invalid avatar URL.', 400)
        }
      }
      update.avatar_url = avatar || null
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Upsert on the wallet address: one identity per wallet, never two.
    const { data: existing, error: findError } = await supabase
      .from('profiles')
      .select('id')
      .ilike('evm_address', ownerAddress)
      .maybeSingle()

    if (findError) throw findError

    if (existing) {
      const { error } = await supabase
        .from('profiles')
        .update(update)
        .eq('id', existing.id)
      if (error) throw error
    } else {
      const { error } = await supabase.from('profiles').insert(update)
      if (error) throw error
    }

    const { data } = await supabase
      .from('profiles')
      .select('display_name, bio, avatar_url, nmiq_address, evm_address')
      .ilike('evm_address', ownerAddress)
      .maybeSingle()

    return json(request, {
      profile: {
        display_name: data?.display_name ?? null,
        bio: data?.bio ?? null,
        avatar_url: data?.avatar_url ?? null,
        nmiq_address: data?.nmiq_address ?? null,
        evm_address: data?.evm_address ?? ownerAddress,
      },
    })
  } catch (error) {
    console.error('update-profile failed', error)
    return errorResponse(
      request,
      error instanceof Error ? error.message : 'Unexpected error',
      500,
    )
  }
})
