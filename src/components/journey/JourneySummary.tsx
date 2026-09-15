import { Car, Footprints } from 'lucide-react'

import {
  formatDistance,
  formatDuration,
  type Route,
  type WalkingRoute,
} from '@/lib/routing'
import { cn } from '@/utils/cn'

interface JourneySummaryProps {
  /** Current location → parking. Omitted when location is unavailable. */
  driveRoute: Route | null
  driveLoading?: boolean
  /** Parking → the driver's real destination. */
  walkRoute: WalkingRoute | null
  walkLoading?: boolean
  className?: string
}

/**
 * "Drive 8 min · Walk 4 min" — the two numbers that decide whether a parking
 * space is worth reserving. Shown before any payment is involved.
 */
export function JourneySummary({
  driveRoute,
  driveLoading = false,
  walkRoute,
  walkLoading = false,
  className,
}: JourneySummaryProps) {
  const driveEstimated = driveRoute?.source === 'estimate'
  const walkEstimated = walkRoute?.source === 'estimate'

  return (
    <div className={cn('rounded-2xl bg-surface p-4', className)}>
      <p className="text-[10px] font-bold uppercase tracking-[1.2px] text-ink-faint">
        To your destination
      </p>

      <div className="mt-3 space-y-2.5">
        <div className="flex items-center gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-surface-raised">
            <Car className="size-4 text-ink" />
          </span>
          {driveRoute ? (
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-bold leading-tight">
                {driveEstimated ? '~' : ''}
                {formatDuration(driveRoute.durationSeconds)} drive
                {driveRoute.trafficAware ? (
                  <span className="ml-1.5 align-middle text-[10px] font-bold uppercase tracking-[0.6px] text-success">
                    live traffic
                  </span>
                ) : null}
              </p>
              <p className="mt-0.5 text-xs text-ink-muted">
                {formatDistance(driveRoute.distanceMeters)}
                {driveEstimated ? ' estimated' : ''}
              </p>
            </div>
          ) : (
            <p className="flex-1 text-[13px] text-ink-muted">
              {driveLoading
                ? 'Calculating drive time…'
                : 'Turn on location for drive time'}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-surface-raised">
            <Footprints className="size-4 text-ink" />
          </span>
          {walkRoute ? (
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-bold leading-tight">
                {walkEstimated ? '~' : ''}
                {formatDuration(walkRoute.durationSeconds)} walk
              </p>
              <p className="mt-0.5 text-xs text-ink-muted">
                {formatDistance(walkRoute.distanceMeters)}
                {walkEstimated ? ' estimated' : ''}
              </p>
            </div>
          ) : (
            <p className="flex-1 text-[13px] text-ink-muted">
              {walkLoading ? 'Calculating walk…' : 'No destination selected'}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
