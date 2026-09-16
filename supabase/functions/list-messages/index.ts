import { createClient } from 'npm:@supabase/supabase-js@2'

import { readToken, verifyToken } from '../_shared/auth.ts'
import { contactFor, loadContacts, loadThread } from '../_shared/chat.ts'
import { errorResponse, json, preflight } from '../_shared/http.ts'

interface Body {
  evm_address?: string
  auth_token?: string
  reservation_id?: string
  /** ISO timestamp cursor — return only messages created after it. */
  since?: string
  limit?: number
}

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

/** An ISO-8601 instant, as returned by the database. */
const ISO_TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/

/**
 * Messages in one thread, oldest first.
 *
 * Supports a `since` cursor so the client can poll cheaply: the first load
 * asks for history, each poll asks only for what is new. Reading a thread also
 * advances the caller's read cursor, which is what drives unread counts.
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

    const reservationId = (body.reservation_id ?? '').trim()
    if (!reservationId) {
      return errorResponse(request, 'A reservation is required.')
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Membership is checked before anything is read, and a non-member gets the
    // same answer as a missing reservation so ids cannot be probed.
    const thread = await loadThread(supabase, reservationId, owner)
    if (!thread) return errorResponse(request, 'Conversation not found.', 404)

    const limit = Math.min(Math.max(Number(body.limit) || DEFAULT_LIMIT, 1), MAX_LIMIT)

    let query = supabase
      .from('conversation_messages')
      .select('id, sender_evm_address, body, created_at')
      .eq('reservation_id', reservationId)
      .order('created_at', { ascending: true })
      .limit(limit)

    // The cursor is passed through verbatim rather than round-tripped through
    // `Date`. Postgres keeps microseconds and JS only milliseconds, so a parsed
    // cursor truncates and then re-matches the very message it points at —
    // which makes every poll return that message again.
    if (body.since && ISO_TIMESTAMP.test(body.since)) {
      query = query.gt('created_at', body.since)
    }

    const { data, error } = await query
    if (error) throw error

    const messages = (data ?? []).map((row) => ({
      id: row.id as string,
      body: row.body as string,
      created_at: row.created_at as string,
      is_mine: String(row.sender_evm_address).toLowerCase() === owner,
    }))

    // Reading the thread marks it read. Done after the select so the messages
    // returned are unaffected, and only when the caller actually got the tail
    // of the history (a cursor poll must not skip unread older messages).
    if (!body.since) {
      await supabase.from('conversation_reads').upsert(
        {
          reservation_id: reservationId,
          evm_address: owner,
          last_read_at: new Date().toISOString(),
        },
        { onConflict: 'reservation_id,evm_address' },
      )
    }

    const contacts = await loadContacts(supabase, [thread.counterpartyAddress])

    return json(request, {
      messages,
      // The client stores this and sends it back as `since` next poll, so the
      // cursor is always the database's own value rather than a client guess.
      next_cursor: messages.at(-1)?.created_at ?? body.since ?? null,
      thread: {
        reservation_id: thread.reservationId,
        is_driver: thread.isDriver,
        role: thread.isDriver ? 'driver' : 'host',
        space_title: thread.spaceTitle,
        space_image_url: thread.spaceImageUrl,
        status: thread.status,
        start_at: thread.startAt,
        end_at: thread.endAt,
      },
      contact: contactFor(contacts, thread),
    })
  } catch (error) {
    console.error('list-messages failed', error)
    return errorResponse(
      request,
      error instanceof Error ? error.message : 'Unexpected error',
      500,
    )
  }
})
