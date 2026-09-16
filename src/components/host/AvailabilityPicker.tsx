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

  const enabled = days.some((day) => day.enabled)

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-7 gap-1.5">
        {days.map((day, index) => (
          <button
            key={WEEKDAYS[index]}
            type="button"
            role="switch"
            aria-checked={day.enabled}
            aria-label={`${WEEKDAYS[index]} available`}
            disabled={disabled}
            onClick={() => update(index, { enabled: !day.enabled })}
            className={cn(
              'flex flex-col items-center gap-1 rounded-xl border py-2 text-[11px] font-bold transition-colors',
              day.enabled
                ? 'border-brand-fill bg-brand-fill text-brand-fg'
                : 'border-line bg-surface-raised text-ink-muted',
              disabled && 'opacity-50',
            )}
          >
            {WEEKDAYS[index].slice(0, 3)}
            <span
              className={cn(
                'size-1.5 rounded-full',
                day.enabled ? 'bg-brand-fg' : 'bg-line-strong',
              )}
            />
          </button>
        ))}
      </div>

      {enabled ? (
        <div className="grid grid-cols-1 gap-2">
          {days.map((day, index) =>
            day.enabled ? (
              <div
                key={WEEKDAYS[index]}
                className="flex items-center justify-between gap-2 rounded-2xl border border-line bg-surface-raised px-3.5 py-2.5"
              >
                <span className="text-[13px] font-bold">
                  {WEEKDAYS[index]}
                </span>
                <div className="flex items-center gap-1.5">
                  <select
                    value={day.start}
                    disabled={disabled}
                    aria-label={`${WEEKDAYS[index]} start time`}
                    onChange={(event) =>
                      update(index, { start: event.target.value })
                    }
                    className="rounded-lg bg-surface px-2 py-1.5 text-[12px] font-semibold text-ink outline-none"
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
                    disabled={disabled}
                    aria-label={`${WEEKDAYS[index]} end time`}
                    onChange={(event) =>
                      update(index, { end: event.target.value })
                    }
                    className="rounded-lg bg-surface px-2 py-1.5 text-[12px] font-semibold text-ink outline-none"
                  >
                    {HOURS.map((hour) => (
                      <option key={hour} value={hour}>
                        {hour}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : null,
          )}
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-line bg-surface-raised px-3.5 py-3 text-center text-[12px] font-medium text-ink-muted">
          No hours set — drivers can book at any time.
        </p>
      )}
    </div>
  )
}
