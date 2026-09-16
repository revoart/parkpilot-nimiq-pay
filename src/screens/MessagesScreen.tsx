import { MessageSquare } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Avatar } from '@/components/profile/Avatar'
import { AppShell } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { StateCard } from '@/components/ui/StateCard'
import { useWallet } from '@/hooks/useWallet'
import { listConversations } from '@/lib/chat'
import type { ConversationSummary } from '@/types'
import { cn } from '@/utils/cn'
import { shortenAddress } from '@/utils/format'

/** Short, chat-style timestamp: time today, weekday this week, else a date. */
function stamp(value: string | null): string {
  if (!value) return ''
  const then = new Date(value)
  if (Number.isNaN(then.getTime())) return ''

  const now = new Date()
  const sameDay = then.toDateString() === now.toDateString()
  if (sameDay) {
    return then.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  }

  const days = (now.getTime() - then.getTime()) / 86_400_000
  if (days < 7) return then.toLocaleDateString(undefined, { weekday: 'short' })
  return then.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function ConversationRow({
  conversation,
  onOpen,
}: {
  conversation: ConversationSummary
  onOpen: () => void
}) {
  const name =
    conversation.contact.display_name ??
    shortenAddress(conversation.counterparty_address, 4)
  const preview = conversation.last_message_body
    ? `${conversation.last_message_is_mine ? 'You: ' : ''}${conversation.last_message_body}`
    : 'No messages yet'
  const unread = conversation.unread_count > 0

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'flex w-full items-center gap-3 rounded-2xl border border-line bg-surface-raised p-3 text-left',
        'shadow-[0_4px_12px_rgba(0,0,0,0.04)] transition active:opacity-90',
      )}
    >
      <Avatar
        url={conversation.contact.avatar_url}
        name={conversation.contact.display_name}
        address={conversation.counterparty_address}
        className="size-11 shrink-0 rounded-full"
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p
            className={cn(
              'truncate text-[15px] tracking-[-0.2px]',
              unread ? 'font-extrabold' : 'font-bold',
            )}
          >
            {name}
          </p>
          <span className="shrink-0 text-[11px] text-ink-muted">
            {stamp(conversation.last_message_at)}
          </span>
        </div>

        <div className="mt-0.5 flex items-center justify-between gap-2">
          <p
            className={cn(
              'truncate text-[13px]',
              unread ? 'font-semibold text-ink' : 'text-ink-muted',
            )}
          >
            {preview}
          </p>
          {unread ? (
            <span
              className="flex min-w-5 shrink-0 items-center justify-center rounded-full bg-brand-fill px-1.5 py-0.5 text-[10px] font-extrabold text-brand-fg"
              aria-label={`${conversation.unread_count} unread`}
            >
              {conversation.unread_count}
            </span>
          ) : null}
        </div>

        <p className="mt-1 truncate text-[11px] text-ink-faint">
          {conversation.role === 'host' ? 'As host' : 'As driver'} ·{' '}
          {conversation.space_title}
        </p>
      </div>
    </button>
  )
}

/**
 * Every booking the wallet is party to, as a chat list.
 *
 * There is no fifth bottom-nav item: the design specifies four, so this is
 * reached from the bookings screens and from a thread's back link.
 */
export function MessagesScreen() {
  const navigate = useNavigate()
  const wallet = useWallet()
  const [items, setItems] = useState<ConversationSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!wallet.address) {
      setLoading(false)
      return
    }
    setError(null)
    try {
      setItems(await listConversations(wallet.address))
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not load your messages.',
      )
    } finally {
      setLoading(false)
    }
  }, [wallet.address])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <AppShell showBack title="Messages">
      {!wallet.address ? (
        <StateCard
          tone="brand"
          icon={<MessageSquare className="size-6" />}
          title="Connect your wallet"
          description="Messages are tied to your wallet so hosts and drivers can reach you."
        >
          <Button full size="lg" onClick={() => void wallet.connect()}>
            Connect Wallet
          </Button>
        </StateCard>
      ) : loading ? (
        <div className="space-y-3" aria-busy="true">
          <span className="sr-only">Loading your messages…</span>
          {[0, 1, 2].map((index) => (
            <div
              key={index}
              aria-hidden="true"
              className="flex items-center gap-3 rounded-2xl border border-line bg-surface-raised p-3"
            >
              <Skeleton className="size-11 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-2/5" />
                <Skeleton className="h-3 w-3/5" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <StateCard
          tone="danger"
          icon={<MessageSquare className="size-6" />}
          title="Couldn't load your messages"
          description={error}
        >
          <Button full size="lg" onClick={() => void load()}>
            Try Again
          </Button>
        </StateCard>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<MessageSquare className="size-6" />}
          title="No conversations yet"
          description="Once you book a space, you can message the host here."
          action={
            <Button full variant="secondary" size="md" onClick={() => navigate('/')}>
              Find Parking
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {items.map((conversation) => (
            <ConversationRow
              key={conversation.reservation_id}
              conversation={conversation}
              onOpen={() => navigate(`/messages/${conversation.reservation_id}`)}
            />
          ))}
        </div>
      )}
    </AppShell>
  )
}
