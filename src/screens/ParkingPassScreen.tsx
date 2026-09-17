import {
  ArrowRight,
  Car,
  Check,
  ChevronDown,
  ExternalLink,
  Footprints,
  Loader2,
  MapPin,
  Navigation,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { AppShell } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { StateCard } from '@/components/ui/StateCard'
import { StatusPill } from '@/components/ui/StatusPill'
import { UsdEquivalent } from '@/components/ui/UsdEquivalent'
import { ConnectWalletPrompt } from '@/components/wallet/ConnectWalletPrompt'
import { destinationQuery, destinationQueryWith } from '@/hooks/useDestination'
import { useGeolocation } from '@/hooks/useGeolocation'
import { useWallet } from '@/hooks/useWallet'
import { trackEvent } from '@/lib/analytics/events'
import {
  getParkedCar,
  saveParkedCar,
  type ParkedCar,
} from '@/lib/findmycar/storage'
import { getReservation, type ReservationDetails } from '@/lib/reservations'
import type { Destination } from '@/types'
import { cn } from '@/utils/cn'
import { explorerTxUrl } from '@/utils/explorer'
import {
  formatDateLabel,
  formatTimeLabel,
  formatNim,
  shortenAddress,
} from '@/utils/format'

function ReceiptRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-xs text-ink-muted">{label}</span>
      <span className="break-all text-right text-xs font-medium">{value}</span>
    </div>
  )
}

export function ParkingPassScreen() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const wallet = useWallet()
  const geo = useGeolocation()

  const [details, setDetails] = useState<ReservationDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [parked, setParked] = useState<ParkedCar | null>(null)
  const [pendingSave, setPendingSave] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [attempt, setAttempt] = useState(0)

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

  const load = useCallback(async () => {
    if (!id || !wallet.address) return
    setLoading(true)
    setError(null)
    try {
      const result = await getReservation(id, wallet.address)
      setDetails(result)
      void trackEvent('parking_pass_viewed', {
        nimiqAddress: wallet.address,
        metadata: { reservation_id: id },
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load pass.')
    } finally {
      setLoading(false)
    }
  }, [id, wallet.address])

  useEffect(() => {
    void load()
  }, [load, attempt])

  useEffect(() => {
    if (id) setParked(getParkedCar(id))
  }, [id])

  useEffect(() => {
    if (!pendingSave || !geo.coords || !details) return
    const car: ParkedCar = {
      reservationId: details.reservation.id,
      parkingSpaceId: details.parkingSpace.id,
      title: details.parkingSpace.title,
      address: details.parkingSpace.address,
      lat: geo.coords.lat,
      lng: geo.coords.lng,
      timestamp: new Date().toISOString(),
    }
    saveParkedCar(car)
    setParked(car)
    setPendingSave(false)
    if (wallet.address) {
      void trackEvent('find_my_car_used', {
        nimiqAddress: wallet.address,
        metadata: { reservation_id: details.reservation.id },
      })
    }
  }, [pendingSave, geo.coords, details, wallet.address])

  if (!wallet.address) {
    return (
      <AppShell showBack title="My Parking Pass">
        <ConnectWalletPrompt
          title="Connect Your Wallet"
          description="Sign in to view your parking pass and booking details."
        />
      </AppShell>
    )
  }

  if (loading) {
    return (
      <AppShell showBack title="Parking pass">
        <div className="space-y-3">
          <div className="flex flex-col items-center pt-1">
            <Skeleton className="size-16 rounded-full" />
            <Skeleton className="mt-3 h-7 w-52" />
            <Skeleton className="mt-2 h-6 w-44 rounded-full" />
          </div>

          <div className="space-y-3 rounded-2xl bg-surface-raised p-4">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <div className="flex items-start justify-between gap-3 border-t border-dashed border-line pt-3">
              <div className="space-y-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-3 w-24" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
            <div className="border-t border-dashed border-line pt-3">
              <Skeleton className="mx-auto h-3 w-36" />
              <Skeleton className="mx-auto mt-2 h-6 w-32" />
            </div>
          </div>

          <Skeleton className="h-14 w-full rounded-2xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-11 w-full rounded-2xl" />
        </div>
      </AppShell>
    )
  }

  if (error || !details) {
    return (
      <AppShell showBack title="Parking pass">
        <div className="flex min-h-full items-center">
          <StateCard
            tone="danger"
            icon={<ShieldAlert className="size-6" />}
            title="Pass not found"
            description={error ?? 'This reservation is unavailable.'}
          >
            <Button
              full
              size="lg"
              onClick={() => setAttempt((current) => current + 1)}
            >
              Try Again
            </Button>
            <Button
              full
              size="lg"
              variant="secondary"
              onClick={() => navigate(-1)}
            >
              Go Back
            </Button>
          </StateCard>
        </div>
      </AppShell>
    )
  }

  const { reservation, parkingSpace, payment } = details
  const confirmed =
    reservation.status === 'reservation_confirmed' ||
    payment?.status === 'payment_confirmed'
  const txHash = payment?.tx_hash ?? null
  const bookingCode = `PP-${reservation.id.replace(/-/g, '').slice(0, 6).toUpperCase()}`

  return (
    <AppShell
      showBack
      title="Parking pass"
      action={
        <button
          type="button"
          onClick={() => navigate('/')}
          className="rounded-xl px-2.5 py-1.5 text-[13px] font-semibold text-ink-muted active:bg-surface"
        >
          Done
        </button>
      }
      footer={
        // The two legs stay together: driving to the space, then walking from
        // it, are one journey and are confusing apart.
        <div className="space-y-2">
          {/*
            The session screen holds the live countdown and the extender, and
            this pass is the only route to it. That link used to sit inside the
            collapsed receipt block, so both features looked like they had been
            removed when they were simply unreachable.
          */}
          <Button
            variant="outline"
            full
            size="lg"
            onClick={() => navigate(`/session/${reservation.id}`)}
          >
            Manage session
          </Button>

          {/* Stage 1: drive to the parking space. Never the destination. */}
          <Button
            full
            size="lg"
            onClick={() =>
              navigate(
                `/navigate/${parkingSpace.id}${destinationQuery(destination)}`,
              )
            }
          >
            <Navigation className="size-4" />
            Navigate to Parking
          </Button>

          {destination ? (
            <Button
              variant="outline"
              full
              size="lg"
              onClick={() =>
                navigate(
                  `/navigate/${parkingSpace.id}${destinationQueryWith(destination, { leg: 'walk' })}`,
                )
              }
            >
              <Footprints className="size-4" />
              Walk to Destination
            </Button>
          ) : null}
        </div>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-col items-center pt-1 text-center">
          <div className="flex size-16 items-center justify-center rounded-full border-2 border-success/60 bg-success-bg">
            {confirmed ? (
              <Check className="size-8 text-success" strokeWidth={2.5} />
            ) : (
              <Loader2 className="size-7 animate-spin text-warning" />
            )}
          </div>
          <h1
            className="mt-3 text-[22px] font-extrabold tracking-[-0.4px]"
            role="status"
            aria-live="polite"
          >
            {confirmed ? 'Parking Confirmed' : 'Confirming payment…'}
          </h1>
          <div className="mt-2">
            <StatusPill
              tone={confirmed ? 'success' : 'warning'}
              className={cn(
                'rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.4px]',
                confirmed ? 'border-success/40' : 'border-warning/40',
              )}
            >
              {confirmed
                ? `${formatNim(reservation.amount_nim)} NIM PAID ON-CHAIN`
                : 'Awaiting on-chain confirmation'}
            </StatusPill>
          </div>
        </div>

        {/* Digital ticket: one surface, no nested cards. */}
        <div className="overflow-hidden rounded-2xl bg-surface-raised p-4">
          <p className="text-[11px] font-extrabold uppercase tracking-[1.2px] text-brand">
            Active entry code
          </p>
          <p className="mt-1 text-[20px] font-extrabold tracking-[-0.3px]">
            {parkingSpace.title}
          </p>
          <p className="mt-0.5 text-[13px] text-ink-muted">
            {parkingSpace.address}
          </p>

          <div className="mt-3 flex items-start justify-between gap-3 border-t border-dashed border-line pt-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[1.2px] text-ink-faint">
                Arrival
              </p>
              <p className="mt-0.5 text-[17px] font-bold">
                {formatTimeLabel(reservation.start_at)}
              </p>
              <p className="text-[12px] text-ink-muted">
                {formatDateLabel(reservation.start_at)}
              </p>
            </div>
            <ArrowRight className="mt-5 size-4 shrink-0 text-brand" />
            <div className="min-w-0 text-right">
              <p className="text-[10px] font-bold uppercase tracking-[1.2px] text-ink-faint">
                Departure
              </p>
              <p className="mt-0.5 text-[17px] font-bold">
                {formatTimeLabel(reservation.end_at)}
              </p>
              <p className="text-[12px] text-ink-muted">
                {formatDateLabel(reservation.end_at)}
              </p>
            </div>
          </div>

          <div className="mt-3 border-t border-dashed border-line pt-3 text-center">
            <p className="text-[10px] font-bold uppercase tracking-[1.2px] text-ink-faint">
              Booking monospace code
            </p>
            <p className="mt-1 font-mono text-[20px] font-bold tracking-[1.5px] text-brand">
              {bookingCode}
            </p>
          </div>
        </div>

        {txHash ? (
          <div className="flex items-center gap-3 rounded-2xl border border-brand/40 bg-surface-raised px-3.5 py-3">
            <ShieldCheck className="size-5 shrink-0 text-success" />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-bold">On-chain Proof Verified</p>
              <p className="truncate text-[12px] text-ink-muted">
                Nimiq Tx:{' '}
                <span className="font-mono">{shortenAddress(txHash, 4)}</span>
              </p>
            </div>
            <a
              href={explorerTxUrl(txHash)}
              target="_blank"
              rel="noreferrer"
              aria-label="View transaction on the Nimiq explorer"
              className="flex size-8 shrink-0 items-center justify-center rounded-xl text-brand"
            >
              <ExternalLink className="size-4" />
            </a>
          </div>
        ) : null}

        {/* One slim row instead of another full-width button. */}
        <button
          type="button"
          onClick={() => {
            if (parked) {
              navigate(`/find-my-car?reservation=${reservation.id}`)
              return
            }
            setPendingSave(true)
            geo.request()
          }}
          disabled={geo.loading || pendingSave}
          className="flex w-full items-center gap-2.5 rounded-2xl bg-surface-raised px-4 py-2.5 text-left active:opacity-80 disabled:opacity-60"
        >
          <Car className="size-4 shrink-0 text-ink-soft" />
          <span className="flex-1 truncate text-[13px] font-semibold">
            {parked
              ? 'Find My Car'
              : pendingSave || geo.loading
                ? 'Saving your spot…'
                : "I've parked here"}
          </span>
          <MapPin className="size-3.5 shrink-0 text-ink-faint" />
        </button>

        {geo.error ? (
          <p className="text-center text-xs text-ink-muted">{geo.error}</p>
        ) : null}

        {/* Everything secondary lives behind one disclosure, so the pass itself
            stays a pass: what, when, where, and what to do next. */}
        <div className="overflow-hidden rounded-2xl bg-surface-raised">
          <button
            type="button"
            onClick={() => setDetailsOpen((open) => !open)}
            aria-expanded={detailsOpen}
            aria-controls="pass-details"
            className="flex w-full items-center gap-2 px-4 py-3 text-left active:opacity-80"
          >
            <span className="flex-1 text-[13px] font-semibold">Details</span>
            <ChevronDown
              className={cn(
                'size-4 shrink-0 text-ink-faint transition-transform',
                detailsOpen && 'rotate-180',
              )}
            />
          </button>

          {detailsOpen ? (
            <div id="pass-details" className="space-y-2 px-4 pb-4">
              <ReceiptRow
                label="Amount"
                value={
                  <>
                    {formatNim(reservation.amount_nim)} NIM{' '}
                    <UsdEquivalent
                      nim={reservation.amount_nim}
                      className="text-ink-muted"
                    />
                  </>
                }
              />
              <ReceiptRow label="Network" value="Nimiq" />
              <ReceiptRow
                label="Sender"
                value={shortenAddress(reservation.nimiq_address, 6)}
              />
              <ReceiptRow
                label="Recipient"
                value={
                  payment?.recipient_address
                    ? shortenAddress(payment.recipient_address, 6)
                    : '—'
                }
              />
              <ReceiptRow
                label="Status"
                value={
                  confirmed ? 'Confirmed on-chain' : 'Awaiting confirmation'
                }
              />
              {payment?.block_number ? (
                <ReceiptRow
                  label="Block"
                  value={String(payment.block_number)}
                />
              ) : null}

              {txHash ? (
                <a
                  href={explorerTxUrl(txHash)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 pt-1 text-[13px] font-semibold text-ink"
                >
                  <ExternalLink className="size-3.5" />
                  View transaction
                </a>
              ) : null}

              <button
                type="button"
                onClick={() => navigate(`/session/${reservation.id}`)}
                className="block pt-1 text-[13px] font-semibold text-ink"
              >
                Manage session
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </AppShell>
  )
}
