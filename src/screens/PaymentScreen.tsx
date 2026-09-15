import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ShieldCheck,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { AppShell } from '@/components/layout/AppShell'
import { DestinationCard } from '@/components/journey'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { useWalkingRoute } from '@/hooks/useWalkingRoute'
import { useWallet } from '@/hooks/useWallet'
import { trackEvent } from '@/lib/analytics/events'
import { POLYGON_CHAIN_ID } from '@/lib/ethereum/chains'
import {
  isUserRejection,
  userFacingWalletError,
} from '@/lib/ethereum/errors'
import { pollUsdtPayment } from '@/lib/payments'
import { getReservation, type ReservationDetails } from '@/lib/reservations'
import { isValidAddress, sendUsdtTransfer, toRawAmount } from '@/lib/usdt'
import type { Destination } from '@/types'
import { hapticConfirm } from '@/utils/haptics'
import {
  formatDateLabel,
  formatTimeLabel,
  formatUsdt,
  shortenAddress,
} from '@/utils/format'

type Phase =
  | 'review'
  | 'sending'
  | 'submitted'
  | 'verifying'
  | 'confirmed'
  | 'failed'

const PHASE_MESSAGE: Record<Phase, string> = {
  review: '',
  sending: 'Confirm the payment in Nimiq Pay…',
  submitted: 'Payment submitted. Waiting for confirmation…',
  verifying: 'Verifying blockchain transaction…',
  confirmed: 'Payment confirmed.',
  failed: '',
}

function Row({
  label,
  value,
  mono = false,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-xs text-ink-muted">{label}</span>
      <span className={mono ? 'font-mono text-xs' : 'text-sm font-medium'}>
        {value}
      </span>
    </div>
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

  useEffect(() => {
    void wallet.refreshBalances()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet.address])

  const amountRaw = useMemo(
    () =>
      details
        ? toRawAmount(String(details.reservation.amount_usdt))
        : 0n,
    [details],
  )

  const recipient = details?.parkingSpace.payment_recipient_address ?? ''
  const recipientValid = isValidAddress(recipient)

  const usdtBalanceRaw = useMemo(() => {
    if (wallet.usdtBalance === null) return null
    try {
      return toRawAmount(wallet.usdtBalance)
    } catch {
      return null
    }
  }, [wallet.usdtBalance])

  const insufficientUsdt =
    usdtBalanceRaw !== null && usdtBalanceRaw < amountRaw
  const lowGas = wallet.polBalance !== null && Number(wallet.polBalance) < 0.005

  async function handlePay() {
    if (!details || !wallet.address) return
    setMessage(null)

    if (!recipientValid) {
      setMessage('The parking recipient address is invalid.')
      setPhase('failed')
      return
    }

    setPhase('sending')
    void trackEvent('payment_initiated', {
      evmAddress: wallet.address,
      metadata: { reservation_id: details.reservation.id },
    })

    try {
      const hash = await sendUsdtTransfer({
        from: wallet.address,
        recipient,
        amountRaw,
      })
      setTxHash(hash)
      setPhase('submitted')
      void trackEvent('payment_submitted', {
        evmAddress: wallet.address,
        metadata: { reservation_id: details.reservation.id, tx_hash: hash },
      })

      const result = await pollUsdtPayment(details.reservation.id, hash, {
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
          evmAddress: wallet.address,
          metadata: { reservation_id: details.reservation.id, tx_hash: hash },
        })
        navigate(`/pass/${details.reservation.id}`, { replace: true })
        return
      }

      setPhase('failed')
      setMessage(result.reason ?? 'The payment could not be verified.')
    } catch (err) {
      if (isUserRejection(err)) {
        setPhase('review')
        setMessage(
          'Payment cancelled. Your wallet transaction was cancelled and nothing was charged — you can try again.',
        )
      } else {
        setPhase('failed')
        setMessage(userFacingWalletError(err))
      }
    }
  }

  if (!wallet.address) {
    return (
      <AppShell showBack title="Confirm payment">
        <EmptyState
          title="Connect your wallet"
          description="Connect Nimiq Pay to review and pay for this reservation."
          action={
            <Button
              size="md"
              onClick={() => void wallet.connect()}
              loading={wallet.status === 'connecting'}
            >
              Connect Wallet
            </Button>
          }
        />
      </AppShell>
    )
  }

  if (loading) {
    return (
      <AppShell showBack title="Confirm payment">
        <div className="space-y-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </AppShell>
    )
  }

  if (loadError || !details) {
    return (
      <AppShell showBack title="Confirm payment">
        <EmptyState
          title="Reservation not found"
          description={loadError ?? 'This reservation is unavailable.'}
          action={
            <Button variant="secondary" size="md" onClick={() => navigate('/')}>
              Back to parking
            </Button>
          }
        />
      </AppShell>
    )
  }

  const { reservation, parkingSpace } = details
  const processing =
    phase === 'sending' || phase === 'submitted' || phase === 'verifying'

  return (
    <AppShell showBack title="Confirm payment">
      <div className="space-y-3">
        <Card className="space-y-3">
          <p className="text-sm font-semibold">{parkingSpace.title}</p>
          <p className="text-xs text-ink-muted">{parkingSpace.address}</p>
          <div className="space-y-2 border-t border-line pt-3">
            <Row label="Date" value={formatDateLabel(reservation.start_at)} />
            <Row
              label="Time"
              value={`${formatTimeLabel(reservation.start_at)} – ${formatTimeLabel(reservation.end_at)}`}
            />
            <Row label="Amount" value={`${formatUsdt(reservation.amount_usdt)} USDT`} />
            <Row label="Token" value="USDT" />
            <Row label="Network" value={`Polygon (${POLYGON_CHAIN_ID})`} />
            <Row label="Recipient" value={shortenAddress(recipient, 6)} mono />
          </div>
          <div className="flex justify-between border-t border-line pt-3">
            <span className="text-sm font-semibold">Total</span>
            <span className="text-lg font-bold">
              {formatUsdt(reservation.amount_usdt)} USDT
            </span>
          </div>
        </Card>

        {destination ? (
          <DestinationCard
            destination={destination}
            route={walkRoute}
            caption="From this parking"
          />
        ) : null}

        {insufficientUsdt ? (
          <div className="flex items-start gap-2 rounded-card border border-danger/30 bg-danger-bg p-3 text-xs text-danger">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>
              <span className="font-semibold">Insufficient USDT.</span> You have{' '}
              {formatUsdt(wallet.usdtBalance ?? '0')} USDT, but need{' '}
              {formatUsdt(reservation.amount_usdt)} USDT. Add USDT to continue.
            </span>
          </div>
        ) : null}

        {lowGas ? (
          <div className="flex items-start gap-2 rounded-card border border-warning/30 bg-warning-bg p-3 text-xs text-warning">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>
              <span className="font-semibold">Network fee required.</span> Your
              wallet needs a small amount of POL for the Polygon network fee.
              This is not a ParkPilot charge — the parking price above is the
              full amount ParkPilot receives.
            </span>
          </div>
        ) : null}

        {wallet.address && !wallet.onPolygon ? (
          <div className="flex items-start gap-2 rounded-card border border-warning/30 bg-warning-bg p-3 text-xs text-warning">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>
              <span className="font-semibold">Switch to Polygon.</span> ParkPilot
              uses Polygon for USDT payments.{' '}
              <button
                type="button"
                onClick={() => void wallet.connect()}
                className="font-semibold underline"
              >
                Switch network
              </button>
            </span>
          </div>
        ) : null}

        {processing ? (
          <Card className="flex items-center gap-3">
            <Loader2 className="size-5 animate-spin text-accent" />
            <p
              className="text-sm font-medium"
              role="status"
              aria-live="polite"
            >
              {PHASE_MESSAGE[phase]}
            </p>
          </Card>
        ) : null}

        {phase === 'confirmed' ? (
          <Card className="flex items-center gap-3">
            <CheckCircle2 className="size-5 text-success" />
            <p
              className="text-sm font-medium"
              role="status"
              aria-live="polite"
            >
              Payment confirmed.
            </p>
          </Card>
        ) : null}

        {message ? <p className="text-sm text-danger">{message}</p> : null}

        {phase === 'failed' || phase === 'review' ? (
          <>
            <Button
              onClick={() => void handlePay()}
              disabled={insufficientUsdt || !wallet.onPolygon}
            >
              {phase === 'failed'
                ? 'Try Again'
                : `Pay ${formatUsdt(reservation.amount_usdt)} USDT`}
            </Button>
            <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-ink-muted">
              <ShieldCheck className="size-3.5" />
              Confirmed in Nimiq Pay. Verified on Polygon before your pass is
              issued.
            </p>
          </>
        ) : null}

        {txHash && phase !== 'confirmed' ? (
          <p className="break-all text-center font-mono text-[10px] text-ink-muted">
            {txHash}
          </p>
        ) : null}
      </div>
    </AppShell>
  )
}
