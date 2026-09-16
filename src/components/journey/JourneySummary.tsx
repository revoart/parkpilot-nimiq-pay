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
    <div
      className={cn(
        'flex items-center gap-3 rounded-2xl bg-surface-raised p-4 shadow-[0_4px_12px_rgba(0,0,0,0.04)]',
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface">
          <Car className="size-4 text-brand" />
        </span>
        {driveRoute ? (
          <div className="min-w-0">
            <p className="truncate text-[14px] font-bold leading-tight">
              {driveEstimated ? '~' : ''}
              {formatDuration(driveRoute.durationSeconds)} drive
            </p>
            <p className="mt-0.5 truncate text-[11px] text-ink-muted">
              {formatDistance(driveRoute.distanceMeters)}
              {driveEstimated ? ' estimated' : ''}
              {driveRoute.trafficAware ? (
                <span className="text-success"> · live</span>
              ) : null}
            </p>
          </div>
        ) : (
          <p className="text-[13px] text-ink-muted">
            {driveLoading ? 'Calculating drive…' : 'Location off'}
          </p>
        )}
      </div>

      <span
        aria-hidden="true"
        className="w-8 shrink-0 border-t border-dashed border-line-strong"
      />

      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface">
          <Footprints className="size-4 text-brand" />
        </span>
        {walkRoute ? (
          <div className="min-w-0">
            <p className="truncate text-[14px] font-bold leading-tight">
              {walkEstimated ? '~' : ''}
              {formatDuration(walkRoute.durationSeconds)} walk
            </p>
            <p className="mt-0.5 truncate text-[11px] text-ink-muted">
              {formatDistance(walkRoute.distanceMeters)}
              {walkEstimated ? ' estimated' : ''}
            </p>
          </div>
        ) : (
          <p className="text-[13px] text-ink-muted">
            {walkLoading ? 'Calculating walk…' : 'Set destination'}
          </p>
        )}
      </div>
    </div>
  )
}
