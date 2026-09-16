import { requireToken } from '@/lib/auth'
import { getSupabase } from '@/lib/supabase/client'
import { readFunctionError } from '@/lib/supabase/functions'
import type {
  ChatMessage,
  ChatThreadResult,
  ConversationSummary,
} from '@/types'

/**
 * Driver ↔ host chat.
 *
 * Threads are per reservation, so both participants always share a booking and
 * the backend can decide membership from the reservation alone. Every call is
 * authorised server-side; the client never decides who may read a thread.
 */

/** Every booking the wallet is party to, newest activity first. */
export async function listConversations(
  nimiqAddress: string,
): Promise<ConversationSummary[]> {
  const supabase = getSupabase()
  const authToken = await requireToken(nimiqAddress)

  const { data, error } = await supabase.functions.invoke('list-conversations', {
    body: { nimiq_address: nimiqAddress, auth_token: authToken },
  })

  if (error) {
    throw new Error(
      await readFunctionError(error, 'Could not load your conversations.'),
    )
  }

  return (data as { conversations?: ConversationSummary[] })?.conversations ?? []
}

/**
 * One thread. Pass `since` to fetch only what is new — the cursor comes from
 * the previous response's `next_cursor`, so it is always the database's own
 * timestamp rather than something the client reconstructed.
 */
export async function listMessages(
  nimiqAddress: string,
  reservationId: string,
  since?: string | null,
): Promise<ChatThreadResult> {
  const supabase = getSupabase()
  const authToken = await requireToken(nimiqAddress)

  const { data, error } = await supabase.functions.invoke('list-messages', {
    body: {
      nimiq_address: nimiqAddress,
      reservation_id: reservationId,
      since: since ?? null,
      auth_token: authToken,
    },
  })

  if (error) {
    throw new Error(
      await readFunctionError(error, 'Could not load this conversation.'),
    )
  }

  return data as ChatThreadResult
}

export async function sendMessage(
  nimiqAddress: string,
  reservationId: string,
  body: string,
): Promise<ChatMessage> {
  const supabase = getSupabase()
  const authToken = await requireToken(nimiqAddress)

  const { data, error } = await supabase.functions.invoke('send-message', {
    body: {
      nimiq_address: nimiqAddress,
      reservation_id: reservationId,
      body,
      auth_token: authToken,
    },
  })

  if (error) {
    throw new Error(await readFunctionError(error, 'Could not send that message.'))
  }

  const message = (data as { message?: ChatMessage })?.message
  if (!message) throw new Error('Could not send that message.')
  return message
}
