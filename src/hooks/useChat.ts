import { useCallback, useEffect, useRef, useState } from 'react'

import { listMessages, sendMessage } from '@/lib/chat'
import type { ChatContact, ChatMessage, ChatThread } from '@/types'

/**
 * Poll interval while a thread is open.
 *
 * There is no live push available: the app has no Supabase Auth session, so
 * Realtime has no JWT to authorise a private channel against. Polling a cursor
 * is the fit for that architecture, and it only runs while the thread is on
 * screen and the tab is visible.
 */
const POLL_MS = 4000

export interface ChatState {
  messages: ChatMessage[]
  thread: ChatThread | null
  contact: ChatContact | null
  loading: boolean
  sending: boolean
  error: string | null
  send: (body: string) => Promise<boolean>
  reload: () => void
}

let optimisticSeq = 0

export function useChat(
  address: string | null,
  reservationId: string | null,
): ChatState {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [thread, setThread] = useState<ChatThread | null>(null)
  const [contact, setContact] = useState<ChatContact | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * The database's own cursor for the newest message we have. Held in a ref so
   * the poll loop always sends the latest value without being torn down and
   * rebuilt on every new message.
   */
  const cursor = useRef<string | null>(null)
  const alive = useRef(true)

  const load = useCallback(
    async (since: string | null) => {
      if (!address || !reservationId) return
      const result = await listMessages(address, reservationId, since)
      if (!alive.current) return

      setThread(result.thread)
      setContact(result.contact)
      cursor.current = result.next_cursor ?? cursor.current

      if (since) {
        // Poll: append only what is new, ignoring anything already shown.
        setMessages((current) => {
          const seen = new Set(current.map((message) => message.id))
          const fresh = result.messages.filter((message) => !seen.has(message.id))
          return fresh.length ? [...current, ...fresh] : current
        })
      } else {
        setMessages(result.messages)
      }
    },
    [address, reservationId],
  )

  const reload = useCallback(() => {
    void load(null).catch(() => undefined)
  }, [load])

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  // Initial load, then poll while visible.
  useEffect(() => {
    if (!address || !reservationId) return

    let cancelled = false
    cursor.current = null
    setLoading(true)
    setError(null)

    const start = async () => {
      try {
        await load(null)
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Could not load.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void start()

    const timer = window.setInterval(() => {
      // A backgrounded tab should not keep hitting the network.
      if (document.visibilityState !== 'visible') return
      void load(cursor.current).catch(() => undefined)
    }, POLL_MS)

    // Catch up immediately when the user comes back to the tab.
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void load(cursor.current).catch(() => undefined)
      }
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [address, reservationId, load])

  const send = useCallback(
    async (body: string) => {
      const text = body.trim()
      if (!address || !reservationId || !text) return false

      // Show it immediately; the server's copy replaces it on success.
      const localId = `pending-${++optimisticSeq}`
      const optimistic: ChatMessage = {
        id: localId,
        body: text,
        created_at: new Date().toISOString(),
        is_mine: true,
      }
      setMessages((current) => [...current, optimistic])
      setSending(true)
      setError(null)

      try {
        const saved = await sendMessage(address, reservationId, text)
        if (!alive.current) return true
        setMessages((current) =>
          current.map((message) => (message.id === localId ? saved : message)),
        )
        cursor.current = saved.created_at
        return true
      } catch (cause) {
        if (alive.current) {
          // Drop the optimistic copy — it was never stored.
          setMessages((current) =>
            current.filter((message) => message.id !== localId),
          )
          setError(
            cause instanceof Error ? cause.message : 'Could not send that message.',
          )
        }
        return false
      } finally {
        if (alive.current) setSending(false)
      }
    },
    [address, reservationId],
  )

  return { messages, thread, contact, loading, sending, error, send, reload }
}
