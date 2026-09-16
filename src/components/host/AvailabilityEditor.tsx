import { useEffect, useState } from 'react'

import { AvailabilityPicker } from '@/components/host/AvailabilityPicker'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'
import { useWallet } from '@/hooks/useWallet'
import {
  dayRulesToInput,
  defaultDayRules,
  getAvailability,
  WEEKDAYS,
  type DayRule,
} from '@/lib/parking'
import { setAvailability } from '@/lib/host'

function formatTime(value: string): string {
  const [hours, minutes] = value.split(':').map(Number)
  const period = hours >= 12 ? 'PM' : 'AM'
  const hour = hours % 12 === 0 ? 12 : hours % 12
  return `${hour}:${String(minutes ?? 0).padStart(2, '0')} ${period}`
}

/** Compact schedule summary, e.g. "Mon - Fri, 8:00 AM - 6:00 PM". */
function formatSchedule(days: DayRule[]): string {
  const groups: { from: number; to: number; start: string; end: string }[] = []

  days.forEach((day, index) => {
    if (!day.enabled) return
    const last = groups[groups.length - 1]
    if (
      last &&
      index === last.to + 1 &&
      day.start === last.start &&
      day.end === last.end
    ) {
      last.to = index
      return
    }
    groups.push({ from: index, to: index, start: day.start, end: day.end })
  })

  if (groups.length === 0) return 'Any time'

  return groups
    .map((group) => {
      const label =
        group.from === group.to
          ? WEEKDAYS[group.from]
          : `${WEEKDAYS[group.from]} - ${WEEKDAYS[group.to]}`
      return `${label}, ${formatTime(group.start)} - ${formatTime(group.end)}`
    })
    .join(' · ')
}

export function AvailabilityEditor({
  parkingSpaceId,
}: {
  parkingSpaceId: string
}) {
  const wallet = useWallet()
  const [days, setDays] = useState<DayRule[]>(defaultDayRules)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    let active = true
    setLoading(true)
    getAvailability(parkingSpaceId)
      .then((data) => {
        if (!active) return
        const next = defaultDayRules()
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

  async function handleSave() {
    if (!wallet.address) return
    setError(null)
    setMessage(null)

    const { rules, error: ruleError } = dayRulesToInput(days)
    if (ruleError) {
      setError(ruleError)
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
    <Card className="space-y-3 border border-line">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.8px] text-ink-faint">
            Availability Schedule
          </p>
          <p className="mt-1 truncate text-[15px] font-bold">
            {formatSchedule(days)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing((value) => !value)}
          className="shrink-0 text-[13px] font-bold text-brand underline"
        >
          {editing ? 'Done' : 'Edit'}
        </button>
      </div>

      {editing ? (
        <>
          <p className="text-xs leading-relaxed text-ink-muted">
            Set the hours drivers can book. Leave everything off to allow any
            time.
          </p>
          <AvailabilityPicker
            days={days}
            onChange={setDays}
            disabled={saving}
          />
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
        </>
      ) : message ? (
        <p className="text-sm text-success">{message}</p>
      ) : null}
    </Card>
  )
}
