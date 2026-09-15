import { ChevronRight, MapPin, X } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/Button'
import { Handle } from '@/components/ui/Handle'
import type { Place } from '@/lib/places'

interface PlaceSheetProps {
  open: boolean
  title: string
  subtitle?: string
  places: Place[]
  allowCustom?: boolean
  customValue?: string
  submitting?: boolean
  onClose: () => void
  onSelect: (place: Place) => void
  onCustomSubmit?: (address: string) => void
}

export function PlaceSheet({
  open,
  title,
  subtitle,
  places,
  allowCustom = false,
  customValue = '',
  submitting = false,
  onClose,
  onSelect,
  onCustomSubmit,
}: PlaceSheetProps) {
  const [custom, setCustom] = useState(customValue)

  useEffect(() => {
    if (open) setCustom(customValue)
  }, [open, customValue])

  if (!open) return null

  return (
    <div
      className="fade-in fixed inset-0 z-[1500] flex items-end justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="sheet-enter max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-[22px] bg-surface-raised px-4 pb-6"
        onClick={(event) => event.stopPropagation()}
      >
        <Handle />
        <div className="mt-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[17px] font-bold tracking-[-0.3px]">{title}</h2>
            {subtitle ? (
              <p className="mt-0.5 text-xs text-ink-muted">{subtitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface"
          >
            <X className="size-4 text-ink-soft" />
          </button>
        </div>

        {allowCustom ? (
          <div className="mt-4 space-y-2">
            <input
              value={custom}
              onChange={(event) => setCustom(event.target.value)}
              placeholder="Enter an address"
              aria-label="Enter an address"
              className="w-full rounded-xl bg-surface px-3.5 py-3 text-[14px] outline-none placeholder:text-ink-faint"
            />
            <Button
              full
              size="md"
              loading={submitting}
              onClick={() => onCustomSubmit?.(custom)}
              disabled={custom.trim().length < 3}
            >
              Save &amp; find parking
            </Button>
            <p className="text-center text-[11px] text-ink-faint">
              Or pick a suggestion below
            </p>
          </div>
        ) : null}

        <div className="mt-2">
          {places.map((place) => (
            <button
              key={place.id}
              type="button"
              onClick={() => onSelect(place)}
              className="flex w-full items-center gap-3 py-3 active:opacity-70"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface">
                <MapPin className="size-4 text-ink-soft" />
              </span>
              <span className="min-w-0 flex-1 text-left">
                <span className="block truncate text-[15px] font-semibold">
                  {place.name}
                </span>
                <span className="block truncate text-xs text-ink-muted">
                  {place.address}
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-ink-faint" />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
