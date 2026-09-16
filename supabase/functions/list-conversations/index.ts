import { createClient } from 'npm:@supabase/supabase-js@2'

import { readToken, verifyToken } from '../_shared/auth.ts'
import { contactFor, loadContacts, type Thread } from '../_shared/chat.ts'
import { errorResponse, json, preflight } from '../_shared/http.ts'

interface Body {
  evm_address?: string
  auth_token?: string
}

interface SummaryRow {
  reservation_id: string
  is_driver: boolean
  driver_address: string | null
  host_address: string | null
  space_title: string | null
  space_image_url: string | null
  status: string
  start_at: string
  end_at: string
  last_message_at: string | null
  last_message_body: string | null
  last_message_sender: string | null
  unread_count: number
}

/**
 * Every booking the caller is party to, newest activity first.
 *
 * Summaries come from `conversation_summaries` (migration 0019) rather than
 * being reduced in JS, so the payload is proportional to the number of bookings
 * rather than the number of messages.
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

    const { data, error } = await supabase.rpc('conversation_summaries', {
      p_owner: owner,
    })
    if (error) throw error

    const rows = (data ?? []) as SummaryRow[]

    // One profile query for every counterparty, rather than one per thread.
    const contacts = await loadContacts(
      supabase,
      rows.map((row) =>
        (row.is_driver ? row.host_address : row.driver_address) ?? '',
      ),
    )

    const conversations = rows.map((row) => {
      const thread = {
        reservationId: row.reservation_id,
        driverAddress: (row.driver_address ?? '').toLowerCase(),
        hostAddress: (row.host_address ?? '').toLowerCase(),
        isDriver: row.is_driver,
        counterpartyAddress: (
          (row.is_driver ? row.host_address : row.driver_address) ?? ''
        ).toLowerCase(),
        spaceTitle: row.space_title ?? 'Parking space',
        spaceImageUrl: row.space_image_url,
        status: row.status,
        startAt: row.start_at,
        endAt: row.end_at,
      } satisfies Thread

      return {
        reservation_id: row.reservation_id,
        is_driver: row.is_driver,
        role: row.is_driver ? 'driver' : 'host',
        space_title: thread.spaceTitle,
        space_image_url: row.space_image_url,
        status: row.status,
        start_at: row.start_at,
        end_at: row.end_at,
        last_message_at: row.last_message_at,
        last_message_body: row.last_message_body,
        // Whether the last message was the caller's own, so the list can mark
        // it "You: …" without re-deriving it from the address.
        last_message_is_mine: row.last_message_sender
          ? row.last_message_sender.toLowerCase() === owner
          : null,
        unread_count: Number(row.unread_count ?? 0),
        // The client shows this when the counterparty has no display name.
        counterparty_address: thread.counterpartyAddress,
        contact: contactFor(contacts, thread),
      }
    })

    return json(request, { conversations })
  } catch (error) {
    console.error('list-conversations failed', error)
    return errorResponse(
      request,
      error instanceof Error ? error.message : 'Unexpected error',
      500,
    )
  }
})
