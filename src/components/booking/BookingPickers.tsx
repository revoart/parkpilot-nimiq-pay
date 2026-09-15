import { Minus, Plus } from 'lucide-react'

import type { DayAvailability } from '@/lib/parking'
import { cn } from '@/utils/cn'

function formatDayLabel(iso: string, index: number): { top: string; bottom: string } {
  if (index === 0) return { top: 'Today', bottom: iso.slice(8, 10) }
  if (index === 1) return { top: 'Tomorrow', bottom: iso.slice(8, 10) }
  const date = new Date(`${iso}T12:00:00`)
  return {
    top: date.toLocaleDateString(undefined, { weekday: 'short' }),
    bottom: String(date.getDate()),
  }
}

export function DayGrid({
  days,
  value,
  onChange,
}: {
  days: DayAvailability[]
  value: string
  onChange: (date: string) => void
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {days.map((day, index) => {
        const label = formatDayLabel(day.date, index)
        const active = day.date === value
        return (
          <button
            key={day.date}
            type="button"
            onClick={() => onChange(day.date)}
            className={cn(
              'rounded-xl border py-3 text-center transition',
              active
                ? 'border-brand bg-brand text-brand-fg'
                : 'border-line text-ink',
            )}
          >
            <span className="block text-[10px] font-semibold uppercase">
              {label.top}
            </span>
            <span className="block text-[16px] font-bold">{label.bottom}</span>
          </button>
        )
      })}
    </div>
  )
}

export function TimeSlotPicker({
  slots,
  value,
  onChange,
}: {
  slots: string[]
  value: string
  onChange: (time: string) => void
}) {
  return (
    <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {slots.map((slot) => (
        <button
          key={slot}
          type="button"
          onClick={() => onChange(slot)}
          className={cn(
            'shrink-0 rounded-xl border px-3.5 py-2 text-[13px] font-semibold transition',
            slot === value
              ? 'border-brand bg-brand text-brand-fg'
              : 'border-line text-ink',
          )}
        >
          {slot}
        </button>
      ))}
    </div>
  )
}

export function DurationPicker({
  value,
  onChange,
  presets = [60, 120, 180, 240, 480],
  maxMinutes,
}: {
  value: number
  onChange: (minutes: number) => void
  presets?: number[]
  maxMinutes: number
}) {
  const step = 30
  const label = (minutes: number) =>
    minutes >= 60
      ? `${minutes / 60} hr${minutes === 60 ? '' : 's'}`
      : `${minutes} min`

  return (
    <div className="no-scrollbar -mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1">
      {presets
        .filter((preset) => preset <= maxMinutes)
        .map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => onChange(preset)}
            className={cn(
              'shrink-0 rounded-xl border px-3.5 py-2 text-[13px] font-semibold transition',
              value === preset
                ? 'border-brand bg-brand text-brand-fg'
                : 'border-line text-ink',
            )}
          >
            {label(preset)}
          </button>
        ))}
      <div className="flex shrink-0 items-center gap-1 rounded-xl border border-line px-1.5 py-1">
        <button
          type="button"
          aria-label="Decrease duration"
          onClick={() => onChange(Math.max(step, value - step))}
          className="flex size-7 items-center justify-center rounded-lg bg-surface"
        >
          <Minus className="size-3.5" />
        </button>
        <span className="min-w-[52px] text-center text-[12px] font-bold">
          {label(value)}
        </span>
        <button
          type="button"
          aria-label="Increase duration"
          onClick={() => onChange(Math.min(maxMinutes, value + step))}
          className="flex size-7 items-center justify-center rounded-lg bg-surface"
        >
          <Plus className="size-3.5" />
        </button>
      </div>
    </div>
  )
}
