import {
  Car,
  ChevronDown,
  ExternalLink,
  Footprints,
  Loader2,
  MapPin,
  Navigation,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { ParkPilotLogo } from '@/components/brand/Logo'
import { AppShell } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { StatusPill } from '@/components/ui/StatusPill'
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
  formatUsdt,
  shortenAddress,
} from '@/utils/format'

function ReceiptRow({ label, value }: { label: string; value: string }) {
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
        evmAddress: wallet.address,
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
  }, [load])

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
        evmAddress: wallet.address,
        metadata: { reservation_id: details.reservation.id },
      })
    }
  }, [pendingSave, geo.coords, details, wallet.address])

  if (!wallet.address) {
    return (
      <AppShell showBack title="Parking pass">
        <EmptyState
          title="Connect your wallet"
          description="Connect Nimiq Pay to view your parking pass."
          action={
            <Button size="md" onClick={() => void wallet.connect()}>
              Connect Wallet
            </Button>
          }
        />
      </AppShell>
    )
  }

  if (loading) {
    return (
      <AppShell showBack title="Parking pass">
        <div className="space-y-3">
          <Skeleton className="h-44 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </AppShell>
    )
  }

  if (error || !details) {
    return (
      <AppShell showBack title="Parking pass">
        <EmptyState
          title="Pass not found"
          description={error ?? 'This reservation is unavailable.'}
        />
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
    >
      <div className="space-y-3">
        {/* Digital ticket: one surface, no nested cards. */}
        <div className="overflow-hidden rounded-2xl bg-surface-raised">
          <div className="flex flex-col items-center px-4 pt-4 text-center">
            <ParkPilotLogo className="mb-3" markClassName="h-6" />
            <div className="mb-3 flex size-16 items-center justify-center rounded-full bg-success-bg">
              {confirmed ? (
                <svg className="size-8" fill="none" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="12" fill="#DCFCE7" />
                  <polyline
                    className="check-path"
                    points="5 12 10 17 19 7"
                    stroke="#15803D"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                <Loader2 className="size-7 animate-spin text-warning" />
              )}
            </div>

            <h1
              className="text-[19px] font-bold tracking-[-0.4px]"
              role="status"
              aria-live="polite"
            >
              {confirmed ? 'Parking reserved.' : 'Confirming payment…'}
            </h1>

            <div className="mt-2.5">
              <StatusPill tone={confirmed ? 'success' : 'warning'}>
                {confirmed ? 'PAID' : 'PENDING'}
              </StatusPill>
            </div>
          </div>

          <div className="mt-4 border-t border-dashed border-line px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[15px] font-bold">
                  {parkingSpace.title}
                </p>
                <p className="mt-0.5 text-[12px] text-ink-muted">
                  {formatDateLabel(reservation.start_at)} ·{' '}
                  {formatTimeLabel(reservation.start_at)} –{' '}
                  {formatTimeLabel(reservation.end_at)}
                </p>
              </div>
              <p className="shrink-0 text-[15px] font-bold">
                {formatUsdt(reservation.amount_usdt)}
                <span className="ml-0.5 text-[10px] font-medium text-ink-muted">
                  USDT
                </span>
              </p>
            </div>

            <div className="mt-3">
              <p className="text-[10px] font-bold uppercase tracking-[1.2px] text-ink-faint">
                Booking code
              </p>
              <p className="mt-0.5 font-mono text-[19px] font-bold tracking-[1.5px]">
                {bookingCode}
              </p>
            </div>
          </div>
        </div>

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
                value={`${formatUsdt(reservation.amount_usdt)} USDT`}
              />
              <ReceiptRow label="Network" value="Polygon" />
              <ReceiptRow
                label="Sender"
                value={shortenAddress(reservation.evm_address, 6)}
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
