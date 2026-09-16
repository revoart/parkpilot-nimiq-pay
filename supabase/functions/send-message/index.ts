import { createClient } from 'npm:@supabase/supabase-js@2'

import { readToken, verifyToken } from '../_shared/auth.ts'
import { loadThread } from '../_shared/chat.ts'
import { errorResponse, json, preflight } from '../_shared/http.ts'

interface Body {
  evm_address?: string
  auth_token?: string
  reservation_id?: string
  body?: string
}

const MAX_BODY = 2000

/**
 * A per-wallet send cap. Chat is the one place in the app where a user can push
 * content at another user, so a simple ceiling keeps a stuck client — or a
 * script — from flooding a host.
 */
const RATE_WINDOW_MS = 60_000
const RATE_MAX = 20

/** Post a message to a reservation thread. */
Deno.serve(async (request) => {
  const options = preflight(request)
  if (options) return options
  if (request.method !== 'POST') {
    return errorResponse(request, 'Method not allowed', 405)
  }

  try {
    const payload = (await request.json().catch(() => null)) as Body | null
    if (!payload) return errorResponse(request, 'Invalid JSON body.')

    const owner = await verifyToken(readToken(request, payload))
    if (!owner) {
      return errorResponse(request, 'Sign in with your wallet to continue.', 401)
    }

    const reservationId = (payload.reservation_id ?? '').trim()
    if (!reservationId) {
      return errorResponse(request, 'A reservation is required.')
    }

    const text = (payload.body ?? '').trim()
    if (!text) return errorResponse(request, 'Write a message first.')
    if (text.length > MAX_BODY) {
      return errorResponse(request, `Messages must be ${MAX_BODY} characters or fewer.`)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Membership first: never reveal whether a reservation exists otherwise.
    const thread = await loadThread(supabase, reservationId, owner)
    if (!thread) return errorResponse(request, 'Conversation not found.', 404)

    const { count } = await supabase
      .from('conversation_messages')
      .select('id', { count: 'exact', head: true })
      .ilike('sender_evm_address', owner)
      .gte('created_at', new Date(Date.now() - RATE_WINDOW_MS).toISOString())

    if ((count ?? 0) >= RATE_MAX) {
      return errorResponse(
        request,
        'You are sending messages too quickly. Try again in a moment.',
        429,
      )
    }

    const { data, error } = await supabase
      .from('conversation_messages')
      .insert({
        reservation_id: reservationId,
        sender_evm_address: owner,
        body: text,
      })
      .select('id, sender_evm_address, body, created_at')
      .single()

    if (error) throw error

    // The sender has by definition read their own message, so the cursor moves
    // with it — otherwise their own message would count as unread for them.
    await supabase.from('conversation_reads').upsert(
      {
        reservation_id: reservationId,
        evm_address: owner,
        last_read_at: new Date().toISOString(),
      },
      { onConflict: 'reservation_id,evm_address' },
    )

    return json(request, {
      message: {
        id: data.id,
        body: data.body,
        created_at: data.created_at,
        is_mine: true,
      },
    })
  } catch (error) {
    console.error('send-message failed', error)
    return errorResponse(
      request,
      error instanceof Error ? error.message : 'Unexpected error',
      500,
    )
  }
})
