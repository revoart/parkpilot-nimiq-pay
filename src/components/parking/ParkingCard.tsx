import { Bookmark, MapPin, Star } from 'lucide-react'
import { useState, type ReactNode } from 'react'

import { UsdtMark } from '@/components/brand/UsdtMark'
import { ListingPhoto } from '@/components/parking/ListingPhoto'
import { StatusPill } from '@/components/ui/StatusPill'
import { parkingTypeLabel } from '@/lib/parking'
import { isSaved, toggleSaved } from '@/lib/saved'
import type { ParkingSpace } from '@/types'
import { cn } from '@/utils/cn'
import { formatDistanceKm, formatUsdt } from '@/utils/format'

/**
 * Cards are rendered both from the radius search (which carries rating
 * aggregates) and from saved listings (which do not), so the rating fields are
 * optional rather than forcing every caller through the nearby RPC.
 */
export type ParkingCardSpace = ParkingSpace & {
  rating_avg?: number | null
  rating_count?: number
}

interface ParkingCardProps {
  space: ParkingCardSpace
  distanceKm?: number | null
  onSelect?: (space: ParkingSpace) => void
  featured?: boolean
  /** Condensed card for tight spots such as the home carousel. */
  compact?: boolean
  /** Optional walk-to-destination line (rendered by the caller). */
  walkSlot?: ReactNode
  /** Optional recommendation badge, e.g. ParkPilot Pick. */
  badge?: ReactNode
  /**
   * Latest end of a reservation covering right now, from the database. Null
   * means the space is free this moment. We only ever state what we know, so
   * nothing is shown when the space is free rather than a blanket "Available".
   */
  busyUntil?: string | null
}

/**
 * Price pill from the Figma card — USDT mark plus amount on a tinted capsule.
 */
function PricePill({ price, className }: { price: number; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-line bg-brand/8 py-1 pl-1.5 pr-2.5',
        className,
      )}
    >
      <UsdtMark className="size-4" />
      <span className="text-[12px] font-bold leading-none tracking-[-0.2px]">
        {formatUsdt(price)} USDT
      </span>
    </span>
  )
}

export function ParkingCard({
  space,
  distanceKm,
  onSelect,
  featured = false,
  compact = false,
  walkSlot = null,
  badge = null,
  busyUntil = null,
}: ParkingCardProps) {
  const [saved, setSaved] = useState(() => isSaved(space.id))

  const busyLabel = busyUntil
    ? `Booked until ${new Date(busyUntil).toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
      })}`
    : null

  // Only a real aggregate is shown. A listing with no reviews falls back to its
  // address rather than displaying a fabricated 0.0 rating.
  const rating = space.rating_avg ?? null
  const reviewCount = space.rating_count ?? 0

  if (compact) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSelect?.(space)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') onSelect?.(space)
        }}
        className="w-full cursor-pointer overflow-hidden rounded-2xl bg-surface-raised text-left transition active:opacity-90"
      >
        <ListingPhoto
          imageUrl={space.image_url}
          title={space.title}
          className="h-16 w-full"
        />
        <div className="p-2.5">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 flex-1 truncate text-[13px] font-bold tracking-[-0.2px]">
              {space.title}
            </p>
            <p className="shrink-0 text-[15px] font-bold leading-none tracking-[-0.3px]">
              {formatUsdt(space.price_usdt)}
              <span className="ml-0.5 text-[10px] font-medium text-ink-muted">
                /hr
              </span>
            </p>
          </div>

          <p className="mt-1 flex items-center gap-1 text-[11px] text-ink-muted">
            <MapPin className="size-3 shrink-0" />
            <span className="truncate">
              {space.address}
              {typeof distanceKm === 'number'
                ? ` · ${formatDistanceKm(distanceKm)}`
                : ''}
            </span>
          </p>

          {walkSlot ? <div className="mt-1.5">{walkSlot}</div> : null}

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <StatusPill className="px-2 py-0.5 text-[10px]">
              {parkingTypeLabel(space.parking_type)}
            </StatusPill>
            {busyLabel ? (
              <StatusPill tone="warning" className="px-2 py-0.5 text-[10px]">
                {busyLabel}
              </StatusPill>
            ) : null}
            {space.ev_charging ? (
              <StatusPill tone="success" className="px-2 py-0.5 text-[10px]">
                EV
              </StatusPill>
            ) : null}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect?.(space)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') onSelect?.(space)
      }}
      className={cn(
        'w-full cursor-pointer rounded-2xl border bg-surface-raised p-2.5 text-left transition active:opacity-90',
        featured ? 'border-brand/60' : 'border-line',
      )}
    >
      <div className="flex gap-3">
        <ListingPhoto
          imageUrl={space.image_url}
          title={space.title}
          className="size-[76px] shrink-0 rounded-xl"
        />

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-start justify-between gap-2">
            {badge ? (
              <StatusPill tone="accent" solid className="uppercase tracking-[0.3px]">
                {badge}
              </StatusPill>
            ) : null}
            {busyLabel ? (
              <StatusPill
                tone="success"
                className="ml-auto uppercase tracking-[0.3px]"
              >
                {busyLabel}
              </StatusPill>
            ) : null}
          </div>

          <p className="truncate text-[16px] font-bold leading-tight tracking-[-0.3px]">
            {space.title}
          </p>

          {rating !== null && reviewCount > 0 ? (
            <p className="flex items-center gap-1.5 text-[12px] leading-none">
              <Star className="size-3.5 shrink-0 fill-star text-star" />
              <span className="font-semibold">{rating.toFixed(1)}</span>
              <span className="text-ink-muted">({reviewCount})</span>
            </p>
          ) : (
            <p className="flex items-center gap-1 text-[12px] text-ink-muted">
              <MapPin className="size-3.5 shrink-0" />
              <span className="truncate">{space.address}</span>
            </p>
          )}

          <div className="mt-auto flex items-end justify-between gap-2 pt-0.5">
            <span className="min-w-0 truncate text-[12px] text-ink-muted">
              {typeof distanceKm === 'number'
                ? `Distance: ${formatDistanceKm(distanceKm)}`
                : space.address}
            </span>
            <PricePill price={space.price_usdt} className="shrink-0" />
          </div>
        </div>
      </div>

      {walkSlot ? <div className="mt-2.5">{walkSlot}</div> : null}

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <StatusPill>{parkingTypeLabel(space.parking_type)}</StatusPill>
        {space.covered ? <StatusPill>Covered</StatusPill> : null}
        {space.ev_charging ? <StatusPill tone="success">EV</StatusPill> : null}
        {space.accessible ? <StatusPill>Accessible</StatusPill> : null}
        <button
          type="button"
          aria-label={saved ? 'Remove from saved' : 'Save parking'}
          onClick={(event) => {
            event.stopPropagation()
            setSaved(toggleSaved(space))
          }}
          className="ml-auto flex size-7 items-center justify-center rounded-lg bg-surface active:opacity-80"
        >
          <Bookmark
            className={cn(
              'size-4',
              saved ? 'fill-ink text-ink' : 'text-ink-muted',
            )}
          />
        </button>
      </div>
    </div>
  )
}
