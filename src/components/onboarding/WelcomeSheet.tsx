import { useEffect, useState } from 'react'
import { Car, Footprints, Target } from 'lucide-react'

import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'

const KEY = 'parkpilot.welcome.seen'

/**
 * One-time explainer. Park → Walk → Arrive is the product's differentiator and
 * isn't discoverable from the map alone, so we say it once and never again.
 */
export function WelcomeSheet() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    try {
      if (!localStorage.getItem(KEY)) setOpen(true)
    } catch {
      // storage unavailable — skip rather than nag on every load
    }
  }, [])

  function dismiss() {
    setOpen(false)
    try {
      localStorage.setItem(KEY, '1')
    } catch {
      // ignore
    }
  }

  return (
    <BottomSheet open={open} title="Parking is not the destination" onClose={dismiss}>
      <div className="space-y-4 pb-1">
        <p className="text-[13px] leading-relaxed text-ink-muted">
          ParkPilot keeps track of two places: where you park, and where you are
          actually going. We show you the walk in between.
        </p>

        <div className="space-y-1 rounded-2xl bg-surface p-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-xl bg-surface-raised">
              <Car className="size-4 text-ink" />
            </span>
            <span className="text-[13px] font-bold">Park here</span>
          </div>
          <div className="ml-4 py-0.5 text-ink-faint">↓</div>
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-xl bg-surface-raised">
              <Footprints className="size-4 text-ink" />
            </span>
            <span className="text-[13px] font-bold">Walk a few minutes</span>
          </div>
          <div className="ml-4 py-0.5 text-ink-faint">↓</div>
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-xl bg-surface-raised">
              <Target className="size-4 text-ink" />
            </span>
            <span className="text-[13px] font-bold">Arrive where you meant to</span>
          </div>
        </div>

        <Button full size="lg" onClick={dismiss}>
          Got it
        </Button>
      </div>
    </BottomSheet>
  )
}
