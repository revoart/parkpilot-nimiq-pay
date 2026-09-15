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
  type DayRule,
} from '@/lib/parking'
import { setAvailability } from '@/lib/host'

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
    <Card className="space-y-3">
      <div>
        <p className="text-sm font-semibold">Availability</p>
        <p className="mt-0.5 text-xs text-ink-muted">
          Set the hours drivers can book. Leave everything off to allow any
          time.
        </p>
      </div>

      <AvailabilityPicker days={days} onChange={setDays} disabled={saving} />

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
