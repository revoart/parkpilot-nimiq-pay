import {
  AlertTriangle,
  Check,
  Copy,
  ExternalLink,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react'
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { NimiqMark } from '@/components/brand/NimiqMark'
import { DestinationCard } from '@/components/journey'
import { AppShell } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'
import { StateCard } from '@/components/ui/StateCard'
import { UsdEquivalent } from '@/components/ui/UsdEquivalent'
import { ChainBadge } from '@/components/wallet/ChainBadge'
import { ConnectWalletPrompt } from '@/components/wallet/ConnectWalletPrompt'
import { useWalkingRoute } from '@/hooks/useWalkingRoute'
import { useWallet } from '@/hooks/useWallet'
import { trackEvent } from '@/lib/analytics/events'
import {
  isValidNimiqAddress,
  nimToLuna,
  normalizeNimiqAddress,
  sendNimiqPayment,
} from '@/lib/nimiq'
import { pollNimPayment } from '@/lib/payments'
import { getReservation, type ReservationDetails } from '@/lib/reservations'
import type { Destination } from '@/types'
import { cn } from '@/utils/cn'
import { explorerTxUrl } from '@/utils/explorer'
import { hapticConfirm } from '@/utils/haptics'
import {
  formatDateLabel,
  formatNim,
  formatTimeLabel,
  shortenAddress,
} from '@/utils/format'

type Phase =
  | 'review'
  | 'sending'
  | 'submitted'
  | 'verifying'
  | 'confirmed'
  | 'failed'

const PHASE_STEP: Record<Phase, number> = {
  review: -1,
  sending: 0,
  submitted: 1,
  verifying: 2,
  confirmed: 3,
  failed: -1,
}

const TRACKER_STEPS = [
  { label: 'Sign', active: 'Signing' },
  { label: 'Submit', active: 'Submitting' },
  { label: 'On-chain check', active: 'Verifying' },
  { label: 'Receipt', active: 'Receipt' },
] as const

function LifecycleTracker({ phase }: { phase: Phase }) {
  const current = PHASE_STEP[phase]

  if (phase === 'confirmed') {
    return (
      <Card>
        <div
          className="flex items-center"
          role="status"
          aria-label="Payment confirmed"
        >
          {TRACKER_STEPS.map((step, index) => (
            <Fragment key={step.label}>
              {index > 0 ? <span className="h-0.5 flex-1 bg-success" /> : null}
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-success/50 bg-success-bg text-success">
                <Check className="size-3.5" strokeWidth={3} />
              </span>
            </Fragment>
          ))}
        </div>
      </Card>
    )
  }

  if (current < 0) {
    return (
      <Card className="space-y-3">
        <p className="text-[11px] font-extrabold uppercase tracking-[1px] text-ink-muted">
          Transaction lifecycle (idle)
        </p>
        <div
          className="flex items-center"
          role="status"
          aria-label="Payment not started"
        >
          {TRACKER_STEPS.map((step, index) => (
            <Fragment key={step.label}>
              {index > 0 ? (
                <span className="h-0.5 flex-1 bg-line-strong" />
              ) : null}
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-line-strong text-[11px] font-bold text-ink-faint">
                {index + 1}
              </span>
            </Fragment>
          ))}
        </div>
      </Card>
    )
  }

  const boundary = (index: number) =>
    index < current
      ? 'bg-success'
      : index === current
        ? 'bg-brand'
        : 'bg-line-strong'

  return (
    <Card className="space-y-3">
      <p className="text-[11px] font-extrabold uppercase tracking-[1px] text-ink-muted">
        Transaction lifecycle tracker
      </p>
      <div className="grid grid-cols-4" role="status" aria-live="polite">
        {TRACKER_STEPS.map((step, index) => {
          const state =
            index < current ? 'done' : index === current ? 'active' : 'todo'
          return (
            <div key={step.label} className="flex flex-col items-center gap-2">
              <div className="flex w-full items-center">
                <span
                  className={cn(
                    'h-0.5 flex-1',
                    index > 0 ? boundary(index) : 'bg-transparent',
                  )}
                />
                {state === 'done' ? (
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-success/50 bg-success-bg text-success">
                    <Check className="size-3.5" strokeWidth={3} />
                  </span>
                ) : state === 'active' ? (
                  <span className="flex h-6 shrink-0 items-center rounded-full bg-brand-fill px-2 text-[10px] font-extrabold uppercase leading-none tracking-[0.3px] text-brand-fg">
                    {step.active}
                  </span>
                ) : (
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-line-strong text-[11px] font-bold text-ink-faint">
                    {index + 1}
                  </span>
                )}
                <span
                  className={cn(
                    'h-0.5 flex-1',
                    index < TRACKER_STEPS.length - 1
                      ? boundary(index + 1)
                      : 'bg-transparent',
                  )}
                />
              </div>
              <span
                className={cn(
                  'text-center text-[11px] leading-tight',
                  state === 'active'
                    ? 'font-bold text-brand'
                    : state === 'done'
                      ? 'font-medium text-ink'
                      : 'text-ink-faint',
                )}
              >
                {step.label}
              </span>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

const PROCESSING_COPY = {
  sending: {
    title: 'Waiting for your wallet…',
    subtitle: 'Confirm the transaction in Nimiq Pay to continue.',
  },
  submitted: {
    title: 'Submitting to the Nimiq network…',
    subtitle: 'Your transaction is being broadcast.',
  },
  verifying: {
    title: 'Verifying on-chain…',
    subtitle: 'This usually takes 15–30 seconds.',
  },
} as const

function ProcessingCard({
  phase,
}: {
  phase: 'sending' | 'submitted' | 'verifying'
}) {
  const copy = PROCESSING_COPY[phase]

  return (
    <Card className="flex flex-col items-center p-6 text-center">
      <span className="flex size-20 items-center justify-center rounded-full border-2 border-brand bg-brand/10">
        <span className="flex size-12 items-center justify-center rounded-full bg-brand/20">
          <span className="size-4 animate-pulse rounded-full bg-brand-fill" />
        </span>
      </span>
      <p
        className="mt-4 text-[20px] font-extrabold tracking-[-0.3px]"
        role="status"
        aria-live="polite"
      >
        {copy.title}
      </p>
      <p className="mt-1.5 text-[14px] text-ink-muted">{copy.subtitle}</p>
    </Card>
  )
}

function Row({
  label,
  value,
  mono = false,
}: {
  label: string
  value: ReactNode
  mono?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-[14px] text-ink-muted">{label}</span>
      <span
        className={cn(
          'text-right text-[14px] font-semibold',
          mono && 'font-mono text-[13px]',
        )}
      >
        {value}
      </span>
    </div>
  )
}

function TransactionProof({
  txHash,
  copied,
  onCopy,
}: {
  txHash: string
  copied: boolean
  onCopy: () => void
}) {
  return (
    <Card className="space-y-3">
      <p className="text-[11px] font-extrabold uppercase tracking-[1px] text-ink-muted">
        Secure transaction proof
      </p>
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[14px] text-ink-muted">Tx Hash</span>
          <button
            type="button"
            onClick={onCopy}
            aria-label="Copy transaction hash"
            className="inline-flex items-center gap-1.5 rounded-md font-mono text-[13px] font-semibold text-brand"
          >
            {shortenAddress(txHash, 4)}
            {copied ? (
              <Check className="size-3.5" />
            ) : (
              <Copy className="size-3.5" />
            )}
          </button>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-[14px] text-ink-muted">Execution Chain</span>
          <ChainBadge />
        </div>
      </div>
      <a
        href={explorerTxUrl(txHash)}
        target="_blank"
        rel="noreferrer"
        className="flex items-center justify-center gap-1.5 border-t border-line pt-3 text-[13px] font-semibold text-brand underline"
      >
                View on the Nimiq Explorer
        <ExternalLink className="size-3.5" />
      </a>
    </Card>
  )
}

export function PaymentScreen() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const wallet = useWallet()

  const [details, setDetails] = useState<ReservationDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [phase, setPhase] = useState<Phase>('review')
  const [txHash, setTxHash] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // The destination was snapshotted onto the reservation when it was created.
  const destination = useMemo<Destination | null>(() => {
    const row = details?.reservation
    if (
      !row?.destination_name ||
      row.destination_lat === null ||
      row.destination_lng === null
    ) {
      return null
    }
    return {
      name: row.destination_name,
      address: row.destination_address,
      lat: row.destination_lat,
      lng: row.destination_lng,
    }
  }, [details])

  const { route: walkRoute } = useWalkingRoute(
    details
      ? {
          lat: details.parkingSpace.latitude,
          lng: details.parkingSpace.longitude,
        }
      : null,
    destination ? { lat: destination.lat, lng: destination.lng } : null,
  )

  const loadDetails = useCallback(async () => {
    if (!id || !wallet.address) return
    setLoading(true)
    setLoadError(null)
    try {
      const result = await getReservation(id, wallet.address)
      setDetails(result)
      if (result.reservation.status === 'reservation_confirmed') {
        navigate(`/pass/${id}`, { replace: true })
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load.')
    } finally {
      setLoading(false)
    }
  }, [id, wallet.address, navigate])

  useEffect(() => {
    void loadDetails()
  }, [loadDetails])

  const amountLuna = useMemo(
    () => (details ? nimToLuna(String(details.reservation.amount_nim)) : 0n),
    [details],
  )

  // NIM goes to the ParkPilot platform account, not the host's own wallet:
  // hosts are paid out of it so the platform fee can be taken.
  const recipient = details?.reservation.recipient_address ?? ''
  const recipientValid = isValidNimiqAddress(recipient)

  /**
   * The recipient is a real Nimiq account, so it is possible to connect with
   * the account that receives the payment — an operator testing their own
   * marketplace, most obviously.
   *
   * Nimiq rejects a transaction whose sender equals its recipient ("Sender
   * Equals Recipient"), and the wallet's own client will happily build and sign
   * one, so the failure surfaces with no explanation. Catching it here turns a
   * baffling wallet error into a sentence the driver can act on.
   */
  const isSelfPayment =
    recipientValid &&
    wallet.address !== null &&
    normalizeNimiqAddress(wallet.address) === normalizeNimiqAddress(recipient)

  const processingPhase: 'sending' | 'submitted' | 'verifying' | null =
    phase === 'sending' || phase === 'submitted' || phase === 'verifying'
      ? phase
      : null

  async function handlePay() {
    if (!details || !wallet.address) return
    setMessage(null)

    if (!recipientValid) {
      setMessage('The payment address is not configured correctly.')
      setPhase('failed')
      return
    }

    if (isSelfPayment) {
      // Stay in review so switching accounts is all it takes to continue.
      setPhase('review')
      setMessage(
        'This account is the payment recipient, and Nimiq does not allow a transfer to yourself. Connect a different Nimiq account to pay.',
      )
      return
    }

    setPhase('sending')
    void trackEvent('payment_initiated', {
      nimiqAddress: wallet.address,
      metadata: { reservation_id: details.reservation.id },
    })

    try {
      // Nimiq Pay picks the fee — Nimiq transactions are free where possible,
      // so there is no gas token to check for first.
      const hash = await sendNimiqPayment({
        recipient,
        value: Number(amountLuna),
      })
      setTxHash(hash)
      setPhase('submitted')
      void trackEvent('payment_submitted', {
        nimiqAddress: wallet.address,
        metadata: { reservation_id: details.reservation.id, tx_hash: hash },
      })

      const result = await pollNimPayment(details.reservation.id, hash, {
        onUpdate: (update) => {
          if (update.status === 'payment_confirmed') {
            setPhase('confirmed')
            hapticConfirm()
          } else if (update.status === 'payment_failed') setPhase('failed')
          else setPhase('verifying')
        },
      })

      if (result.status === 'payment_confirmed') {
        setPhase('confirmed')
        void trackEvent('payment_confirmed', {
          nimiqAddress: wallet.address,
          metadata: { reservation_id: details.reservation.id, tx_hash: hash },
        })
        navigate(`/pass/${details.reservation.id}`, { replace: true })
        return
      }

      setPhase('failed')
      setMessage(result.reason ?? 'The payment could not be verified.')
    } catch (err) {
      // Nimiq Pay reports a declined approval as a permission error, which is a
      // cancellation rather than a failure — nothing was sent.
      const text = err instanceof Error ? err.message : ''
      if (/denied|reject|cancel|permission/i.test(text)) {
        setPhase('review')
        setMessage(
          'Payment cancelled. Your wallet transaction was cancelled and nothing was charged — you can try again.',
        )
      } else {
        setPhase('failed')
        setMessage(text || 'The payment could not be completed.')
      }
    }
  }

  async function copyTxHash() {
    if (!txHash) return
    try {
      await navigator.clipboard.writeText(txHash)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard is unavailable in insecure contexts; the hash stays visible.
    }
  }

  if (!wallet.address) {
    return (
      <AppShell showBack title="Payment">
        <ConnectWalletPrompt
          title="Connect Your Wallet"
          description="Connect Nimiq Pay to review and pay for this reservation."
        />
      </AppShell>
    )
  }

  if (loading) {
    return (
      <AppShell showBack title="Payment">
        <div className="space-y-4">
          <div className="flex flex-col items-center px-1 pt-1">
            <Skeleton className="h-3 w-44" />
            <div className="mt-3 flex items-center gap-2.5">
              <Skeleton className="size-9 rounded-full" />
              <Skeleton className="h-10 w-32" />
              <Skeleton className="h-6 w-14" />
            </div>
            <Skeleton className="mt-3 h-4 w-48" />
          </div>

          <Card className="space-y-3">
            <Skeleton className="h-3 w-52" />
            <div className="grid grid-cols-4 gap-2">
              {[0, 1, 2, 3].map((step) => (
                <div key={step} className="flex flex-col items-center gap-2">
                  <Skeleton className="size-6 rounded-full" />
                  <Skeleton className="h-3 w-12" />
                </div>
              ))}
            </div>
          </Card>

          <Card className="space-y-2.5">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </Card>
        </div>
      </AppShell>
    )
  }

  if (loadError || !details) {
    return (
      <AppShell showBack title="Payment">
        <div className="flex min-h-full items-center">
          <StateCard
            tone="danger"
            icon={<ShieldAlert className="size-6" />}
            title="Reservation unavailable"
            description={loadError ?? 'This reservation is unavailable.'}
          >
            <Button full size="lg" onClick={() => void loadDetails()}>
              Try Again
            </Button>
            <Button
              full
              size="lg"
              variant="secondary"
              onClick={() => navigate('/')}
            >
              Go Back
            </Button>
          </StateCard>
        </div>
      </AppShell>
    )
  }

  const { reservation, parkingSpace } = details

  const amountHero = (
    <section className="flex flex-col items-center px-1 pt-1 text-center">
      <p className="text-[11px] font-extrabold uppercase tracking-[1.2px] text-ink-muted">
        Total due to solidify slot
      </p>
      <div className="mt-3 flex items-center gap-2.5">
        <NimiqMark className="size-9" />
        <span className="text-[44px] font-extrabold leading-none tracking-[-1.5px]">
          {formatNim(reservation.amount_nim)}
        </span>
        <span className="text-[26px] font-extrabold leading-none text-brand">
          NIM
        </span>
      </div>
      <UsdEquivalent
        nim={reservation.amount_nim}
        className="mt-2 block text-[13px] font-semibold text-ink-faint"
      />
      <p className="mt-3 text-[13px] text-ink-muted">{parkingSpace.address}</p>
    </section>
  )

  const detailRows = (
    <div className="space-y-2.5 px-1">
      <Row label="Listing" value={parkingSpace.title} />
      <Row label="Date" value={formatDateLabel(reservation.start_at)} />
      <Row
        label="Time Window"
        value={`${formatTimeLabel(reservation.start_at)} – ${formatTimeLabel(reservation.end_at)}`}
      />
    </div>
  )

  /**
   * The screen's action, pinned to the bottom.
   *
   * One footer per state, in the same precedence the body used to render them,
   * so every state has an action reachable without scrolling. The explanatory
   * cards stay in the body; only the button moves.
   */
  const footerCta =
    phase === 'confirmed' ? (
      <Button full size="lg" onClick={() => navigate(`/pass/${reservation.id}`)}>
        View Parking Pass
      </Button>
    ) : processingPhase ? null : (
      <Button
        full
        size="lg"
        onClick={() => void handlePay()}
        disabled={isSelfPayment}
      >
        {isSelfPayment
          ? 'Connect a different account to pay'
          : phase === 'failed'
            ? 'Try Again'
            : `Pay ${formatNim(reservation.amount_nim)} NIM`}
      </Button>
    )

  return (
    <AppShell showBack title="Payment" footer={footerCta}>
      <div className="space-y-4">
        {phase === 'confirmed' ? (
          <>
            <LifecycleTracker phase={phase} />

            <Card className="flex flex-col items-center p-6 text-center">
              <span className="flex size-16 items-center justify-center rounded-full border-2 border-success/60 bg-success-bg">
                <Check className="size-8 text-success" strokeWidth={2.5} />
              </span>
              <p
                className="mt-3 text-[22px] font-extrabold tracking-[-0.4px]"
                role="status"
                aria-live="polite"
              >
                Payment Confirmed
              </p>
              <span className="mt-2 inline-flex items-center rounded-full border border-success/40 bg-success-bg px-3 py-1 text-[11px] font-bold uppercase tracking-[0.4px] text-success">
                {formatNim(reservation.amount_nim)} NIM PAID ON-CHAIN
              </span>
            </Card>

            {txHash ? (
              <TransactionProof
                txHash={txHash}
                copied={copied}
                onCopy={() => void copyTxHash()}
              />
            ) : null}

          </>
        ) : processingPhase ? (
          <>
            {amountHero}
            <LifecycleTracker phase={phase} />
            <ProcessingCard phase={processingPhase} />
            {detailRows}
            {destination ? (
              <DestinationCard
                destination={destination}
                route={walkRoute}
                caption="From this parking"
              />
            ) : null}
          </>
        ) : (
          <>
            {amountHero}
            <LifecycleTracker phase={phase} />

            {message ? (
              <div className="flex items-start gap-2 rounded-2xl bg-danger-bg p-3.5 text-[13px] text-danger">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <span>{message}</span>
              </div>
            ) : null}

            {detailRows}

            {destination ? (
              <DestinationCard
                destination={destination}
                route={walkRoute}
                caption="From this parking"
              />
            ) : null}

            {txHash ? (
              <TransactionProof
                txHash={txHash}
                copied={copied}
                onCopy={() => void copyTxHash()}
              />
            ) : null}

            <div className="space-y-3 pt-1">
              <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-ink-muted">
                <ShieldCheck className="size-3.5" />
                Confirmed in Nimiq Pay. Verified on the Nimiq network before
                your pass is
                issued.
              </p>
            </div>
          </>
        )}
      </div>
    </AppShell>
  )
}
