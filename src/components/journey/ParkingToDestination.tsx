import { ArrowDown, Car, Target } from 'lucide-react'
import type { ReactNode } from 'react'

import { WalkBadge } from '@/components/journey/WalkBadge'
import type { WalkingRoute } from '@/lib/routing'
import type { Destination } from '@/types'
import { cn } from '@/utils/cn'

interface ParkingToDestinationProps {
  parking: { title: string; address: string }
  destination: Destination
  route: WalkingRoute | null
  loading?: boolean
  variant?: 'full' | 'compact'
  className?: string
  /** Optional CTAs rendered under the stepper. */
  actions?: ReactNode
}

/**
 * Park → Walk → Arrive.
 *
 * The defining ParkPilot block: parking is not the destination, so we always
 * show the walk that follows it.
 */
export function ParkingToDestination({
  parking,
  destination,
  route,
  loading = false,
  variant = 'full',
  className,
  actions,
}: ParkingToDestinationProps) {
  if (variant === 'compact') {
    return (
      <div className={cn('flex items-center gap-2 text-[13px]', className)}>
        <Car className="size-3.5 shrink-0 text-ink-soft" />
        <span className="truncate font-semibold">Park here</span>
        <ArrowDown className="size-3.5 shrink-0 -rotate-90 text-ink-faint" />
        <WalkBadge route={route} loading={loading} size="sm" className="shrink-0" />
      </div>
    )
  }

  return (
    <div className={cn('rounded-2xl bg-surface p-4', className)}>
      <p className="text-[10px] font-bold uppercase tracking-[1.2px] text-ink-faint">
        Park → Walk → Arrive
      </p>

      <div className="mt-3 space-y-1">
        <div className="flex items-start gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-surface-raised">
            <Car className="size-4 text-ink" />
          </span>
          <div className="min-w-0 pt-0.5">
            <p className="text-[13px] font-bold leading-tight">Park here</p>
            <p className="truncate text-xs text-ink-muted">{parking.address}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 py-0.5">
          <span className="flex size-8 shrink-0 justify-center">
            <ArrowDown className="size-4 text-ink-faint" />
          </span>
          <WalkBadge route={route} loading={loading} />
        </div>

        <div className="flex items-start gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-surface-raised">
            <Target className="size-4 text-ink" />
          </span>
          <div className="min-w-0 pt-0.5">
            <p className="text-[13px] font-bold leading-tight">
              {destination.name}
            </p>
            <p className="truncate text-xs text-ink-muted">
              {destination.address ?? 'Your destination'}
            </p>
          </div>
        </div>
      </div>

      {actions ? <div className="mt-4 space-y-2">{actions}</div> : null}
    </div>
  )
}

/** Small helper used by the pass/session "your journey" blocks. */
export function JourneyStep({
  icon,
  label,
  detail,
}: {
  icon: ReactNode
  label: string
  detail?: string
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-surface-raised">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[13px] font-bold leading-tight">{label}</p>
        {detail ? (
          <p className="truncate text-xs text-ink-muted">{detail}</p>
        ) : null}
      </div>
    </div>
  )
}
