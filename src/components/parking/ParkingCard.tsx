import { Bookmark, MapPin } from 'lucide-react'
import { useState, type ReactNode } from 'react'

import { ListingPhoto } from '@/components/parking/ListingPhoto'
import { StatusPill } from '@/components/ui/StatusPill'
import { parkingTypeLabel } from '@/lib/parking'
import { isSaved, toggleSaved } from '@/lib/saved'
import type { ParkingSpace } from '@/types'
import { cn } from '@/utils/cn'
import { formatDistanceKm, formatUsdt } from '@/utils/format'

interface ParkingCardProps {
  space: ParkingSpace
  distanceKm?: number | null
  onSelect?: (space: ParkingSpace) => void
  featured?: boolean
  /** Condensed card for tight spots such as the home carousel. */
  compact?: boolean
  /** Optional walk-to-destination line (rendered by the caller). */
  walkSlot?: ReactNode
  /** Optional recommendation badge, e.g. ParkPilot Pick. */
  badge?: ReactNode
}

export function ParkingCard({
  space,
  distanceKm,
  onSelect,
  featured = false,
  compact = false,
  walkSlot = null,
  badge = null,
}: ParkingCardProps) {
  const [saved, setSaved] = useState(() => isSaved(space.id))

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
        'w-full cursor-pointer overflow-hidden rounded-2xl text-left transition active:opacity-90',
        featured ? 'bg-subtle' : 'bg-surface-raised',
      )}
    >
      <ListingPhoto
        imageUrl={space.image_url}
        title={space.title}
        className="h-28 w-full"
      />

      <div className="p-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {badge ? (
              <span className="mb-0.5 block text-[10px] font-bold uppercase tracking-[1px] text-success">
                {badge}
              </span>
            ) : featured ? (
              <span className="text-[10px] font-bold uppercase tracking-[1px] text-success">
                ✦ ParkPilot Pick
              </span>
            ) : null}
            <p className="truncate text-[15px] font-bold tracking-[-0.2px]">
              {space.title}
            </p>
            <p className="mt-0.5 flex items-center gap-1 text-[12px] text-ink-muted">
              <MapPin className="size-3.5 shrink-0" />
              <span className="truncate">
                {space.address}
                {typeof distanceKm === 'number'
                  ? ` · ${formatDistanceKm(distanceKm)}`
                  : ''}
              </span>
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <p className="text-[19px] font-bold leading-none tracking-[-0.4px]">
              {formatUsdt(space.price_usdt)}
            </p>
            <p className="text-[11px] text-ink-muted">USDT / hr</p>
            <button
              type="button"
              aria-label={saved ? 'Remove from saved' : 'Save parking'}
              onClick={(event) => {
                event.stopPropagation()
                setSaved(toggleSaved(space))
              }}
              className="flex size-7 items-center justify-center rounded-lg bg-surface active:opacity-80"
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

        {walkSlot ? (
          <div className="mt-2.5 rounded-xl bg-surface px-3 py-2">{walkSlot}</div>
        ) : null}

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <StatusPill>{parkingTypeLabel(space.parking_type)}</StatusPill>
          {space.covered ? <StatusPill>Covered</StatusPill> : null}
          {space.ev_charging ? <StatusPill tone="success">EV</StatusPill> : null}
          {space.accessible ? <StatusPill>Accessible</StatusPill> : null}
        </div>
      </div>
    </div>
  )
}
