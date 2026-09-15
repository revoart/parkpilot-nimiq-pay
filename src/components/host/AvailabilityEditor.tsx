import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'
import { Toggle } from '@/components/ui/Toggle'
import { useWallet } from '@/hooks/useWallet'
import { getAvailability } from '@/lib/parking'
import { setAvailability } from '@/lib/host'
import { cn } from '@/utils/cn'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const HOURS = Array.from({ length: 25 }, (_, index) =>
  `${String(index).padStart(2, '0')}:00`,
)

interface DayRule {
  enabled: boolean
  start: string
  end: string
}

function defaults(): DayRule[] {
  return WEEKDAYS.map(() => ({ enabled: false, start: '08:00', end: '20:00' }))
}

export function AvailabilityEditor({
  parkingSpaceId,
}: {
  parkingSpaceId: string
}) {
  const wallet = useWallet()
  const [days, setDays] = useState<DayRule[]>(defaults)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    getAvailability(parkingSpaceId)
      .then((data) => {
        if (!active) return
        const next = defaults()
        for (const rule of data.rules) {
          if (!rule.active) continue
          next[rule.weekday] = {
            enabled: true,
            start: rule.start_time.slice(0, 5),
            end: rule.end_time.slice(0, 5),
          }
        }
        setDays(next)
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [parkingSpaceId])

  function update(index: number, patch: Partial<DayRule>) {
    setDays((current) =>
      current.map((day, i) => (i === index ? { ...day, ...patch } : day)),
    )
  }

  async function handleSave() {
    if (!wallet.address) return
    setError(null)
    setMessage(null)

    const rules = days
      .map((day, weekday) => ({ day, weekday }))
      .filter(({ day }) => day.enabled)
      .map(({ day, weekday }) => ({
        weekday,
        start_time: day.start,
        end_time: day.end,
        active: true,
      }))

    if (rules.some((rule) => rule.end_time <= rule.start_time)) {
      setError('End time must be after start time.')
      return
    }

    setSaving(true)
    try {
      await setAvailability(wallet.address, parkingSpaceId, rules)
      setMessage(
        rules.length === 0
          ? 'Availability cleared — drivers can book any time.'
          : 'Availability saved.',
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <Skeleton className="h-32 w-full" />
  }

  return (
    <Card className="space-y-3">
      <div>
        <p className="text-sm font-semibold">Availability</p>
        <p className="mt-0.5 text-xs text-ink-muted">
          Set the hours drivers can book. Leave everything off to allow any
          time.
        </p>
      </div>

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
                disabled={!day.enabled}
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
                disabled={!day.enabled}
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

      {message ? <p className="text-sm text-success">{message}</p> : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <Button
        full
        size="md"
        variant="secondary"
        onClick={() => void handleSave()}
        loading={saving}
      >
        Save availability
      </Button>
    </Card>
  )
}
