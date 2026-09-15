import { Toggle } from '@/components/ui/Toggle'
import { HOURS, WEEKDAYS, type DayRule } from '@/lib/parking'
import { cn } from '@/utils/cn'

export function AvailabilityPicker({
  days,
  onChange,
  disabled = false,
}: {
  days: DayRule[]
  onChange: (days: DayRule[]) => void
  disabled?: boolean
}) {
  function update(index: number, patch: Partial<DayRule>) {
    onChange(days.map((day, i) => (i === index ? { ...day, ...patch } : day)))
  }

  return (
    <div className="space-y-2">
      {days.map((day, index) => (
        <div
          key={WEEKDAYS[index]}
          className="flex items-center justify-between gap-2 rounded-xl bg-surface px-3 py-2"
        >
          <div className="flex items-center gap-2">
            <Toggle
              on={day.enabled}
              ariaLabel={`${WEEKDAYS[index]} available`}
              onChange={() => update(index, { enabled: !day.enabled })}
            />
            <span className="w-9 text-[13px] font-semibold">
              {WEEKDAYS[index]}
            </span>
          </div>
          <div
            className={cn(
              'flex items-center gap-1',
              !day.enabled && 'opacity-40',
            )}
          >
            <select
              value={day.start}
              disabled={!day.enabled || disabled}
              aria-label={`${WEEKDAYS[index]} start time`}
              onChange={(event) => update(index, { start: event.target.value })}
              className="rounded-lg bg-surface-raised px-2 py-1.5 text-[12px] font-semibold outline-none"
            >
              {HOURS.map((hour) => (
                <option key={hour} value={hour}>
                  {hour}
                </option>
              ))}
            </select>
            <span className="text-xs text-ink-muted">–</span>
            <select
              value={day.end}
              disabled={!day.enabled || disabled}
              aria-label={`${WEEKDAYS[index]} end time`}
              onChange={(event) => update(index, { end: event.target.value })}
              className="rounded-lg bg-surface-raised px-2 py-1.5 text-[12px] font-semibold outline-none"
            >
              {HOURS.map((hour) => (
                <option key={hour} value={hour}>
                  {hour}
                </option>
              ))}
            </select>
          </div>
        </div>
      ))}
    </div>
  )
}
