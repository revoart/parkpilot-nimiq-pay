import { ArrowUp, MessageSquare, Phone } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { Avatar } from '@/components/profile/Avatar'
import { AppShell } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/Button'
import { StateCard } from '@/components/ui/StateCard'
import { useChat } from '@/hooks/useChat'
import { useWallet } from '@/hooks/useWallet'
import { cn } from '@/utils/cn'
import { formatPhone, telHref } from '@/utils/phone'

const MAX_MESSAGE = 2000

function clock(value: string): string {
  const at = new Date(value)
  if (Number.isNaN(at.getTime())) return ''
  return at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

/**
 * One driver ↔ host thread.
 *
 * Messages poll on a cursor while this screen is open (see `useChat`) — there is
 * no live push, because the app has no Supabase Auth session for Realtime to
 * authorise a private channel against.
 */
export function ChatScreen() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const wallet = useWallet()
  const chat = useChat(wallet.address, id ?? null)

  const [draft, setDraft] = useState('')
  const bottom = useRef<HTMLDivElement | null>(null)
  const lastCount = useRef(0)

  // Follow the conversation as it grows, without yanking the view while the
  // user is reading further up.
  useEffect(() => {
    if (chat.messages.length === lastCount.current) return
    const grew = chat.messages.length > lastCount.current
    lastCount.current = chat.messages.length
    if (grew) bottom.current?.scrollIntoView({ block: 'end' })
  }, [chat.messages.length])

  const name = chat.contact?.display_name ?? 'Conversation'

  const phone = chat.contact?.phone ?? null
  const tel = telHref(phone)
  const title = chat.contact?.display_name ?? 'Conversation'

  const submit = async () => {
    const text = draft.trim()
    if (!text || chat.sending) return
    setDraft('')
    const ok = await chat.send(text)
    // Hand the text back if it did not go through, so nothing is lost.
    if (!ok) setDraft(text)
  }

  if (!wallet.address) {
    return (
      <AppShell showBack title="Messages">
        <StateCard
          tone="brand"
          icon={<MessageSquare className="size-6" />}
          title="Connect your wallet"
          description="Sign in to see this conversation."
        >
          <Button full size="lg" onClick={() => void wallet.connect()}>
            Connect Wallet
          </Button>
        </StateCard>
      </AppShell>
    )
  }

  if (chat.loading) {
    return (
      <AppShell showBack title="Conversation">
        <div className="space-y-3" aria-busy="true">
          <span className="sr-only">Loading the conversation…</span>
          <div aria-hidden="true" className="space-y-3">
            <div className="h-10 w-2/3 animate-pulse rounded-2xl bg-line/70" />
            <div className="ml-auto h-10 w-1/2 animate-pulse rounded-2xl bg-line/70" />
            <div className="h-10 w-3/5 animate-pulse rounded-2xl bg-line/70" />
          </div>
        </div>
      </AppShell>
    )
  }

  if (chat.error && chat.messages.length === 0) {
    return (
      <AppShell showBack title="Conversation">
        <StateCard
          tone="danger"
          icon={<MessageSquare className="size-6" />}
          title="Couldn't open this conversation"
          description={chat.error}
        >
          <Button full size="lg" onClick={chat.reload}>
            Try Again
          </Button>
          <Button full variant="secondary" size="lg" onClick={() => navigate(-1)}>
            Go Back
          </Button>
        </StateCard>
      </AppShell>
    )
  }

  return (
    <AppShell
      bleed
      showBack
      title={title}
      action={
        tel ? (
          <a
            href={tel}
            aria-label={`Call ${title}`}
            className="flex size-9 items-center justify-center rounded-xl bg-brand/12 text-brand"
          >
            <Phone className="size-[18px]" />
          </a>
        ) : null
      }
    >
      <div className="flex h-full flex-col">
        {/* Counterparty identity, plus a call action when they have shared one. */}
        <div className="flex items-center gap-3 border-b border-line px-4 py-2.5">
          <Avatar
            url={chat.contact?.avatar_url ?? null}
            name={chat.contact?.display_name ?? null}
            address={null}
            className="size-9 shrink-0 rounded-full"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-bold">{name}</p>
            <p className="truncate text-[11px] text-ink-muted">
              {chat.thread
                ? `${chat.thread.role === 'host' ? 'Host' : 'Driver'} · ${chat.thread.space_title}`
                : ''}
            </p>
          </div>
          {phone && tel ? (
            <a
              href={tel}
              className="shrink-0 rounded-full border border-line px-3 py-1.5 text-[12px] font-bold text-brand"
            >
              {formatPhone(phone)}
            </a>
          ) : null}
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
          {chat.messages.length === 0 ? (
            <p className="mx-auto mt-6 max-w-[260px] text-center text-[13px] text-ink-muted">
              No messages yet. Say hello — you can both see this thread because of
              your booking.
            </p>
          ) : (
            chat.messages.map((message) => (
              <div
                key={message.id}
                className={cn('flex', message.is_mine ? 'justify-end' : 'justify-start')}
              >
                <div
                  className={cn(
                    'max-w-[78%] rounded-2xl px-3.5 py-2.5',
                    message.is_mine
                      ? 'bg-brand-fill text-brand-fg'
                      : 'border border-line bg-surface-raised text-ink',
                    message.id.startsWith('pending-') && 'opacity-70',
                  )}
                >
                  <p className="whitespace-pre-wrap break-words text-[14px] leading-5">
                    {message.body}
                  </p>
                  <p
                    className={cn(
                      'mt-1 text-[10px]',
                      message.is_mine ? 'text-brand-fg/70' : 'text-ink-faint',
                    )}
                  >
                    {clock(message.created_at)}
                    {message.id.startsWith('pending-') ? ' · sending' : ''}
                  </p>
                </div>
              </div>
            ))
          )}
          <div ref={bottom} />
        </div>

        {chat.error && chat.messages.length > 0 ? (
          <p
            role="status"
            className="border-t border-line bg-danger-bg px-4 py-2 text-[12px] font-semibold text-danger"
          >
            {chat.error}
          </p>
        ) : null}

        <div className="safe-bottom border-t border-line bg-surface-raised px-3 py-2.5">
          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  void submit()
                }
              }}
              rows={1}
              maxLength={MAX_MESSAGE}
              aria-label="Message"
              placeholder="Write a message…"
              className="max-h-32 min-h-11 flex-1 resize-none rounded-xl border border-line-strong bg-canvas px-3 py-2.5 text-[14px] text-ink outline-none placeholder:text-ink-faint"
            />
            <Button
              size="md"
              aria-label="Send message"
              disabled={!draft.trim() || chat.sending}
              onClick={() => void submit()}
            >
              <ArrowUp className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </AppShell>
  )
}
