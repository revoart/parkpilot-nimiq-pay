import { Footprints } from 'lucide-react'

import { formatWalkDistance, formatWalkTime, type WalkingRoute } from '@/lib/routing'
import { cn } from '@/utils/cn'

interface WalkBadgeProps {
  route: WalkingRoute | null
  loading?: boolean
  size?: 'sm' | 'md'
  className?: string
}

/**
 * The ParkPilot walking pattern: time first, distance second.
 * `~` marks a straight-line estimate rather than an exact walking route.
 */
export function WalkBadge({
  route,
  loading = false,
  size = 'md',
  className,
}: WalkBadgeProps) {
  if (!route) {
    if (!loading) return null
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 text-ink-faint',
          size === 'sm' ? 'text-[11px]' : 'text-[13px]',
          className,
        )}
      >
        <Footprints className={size === 'sm' ? 'size-3' : 'size-3.5'} />
        Calculating walk…
      </span>
    )
  }

  const estimated = route.source === 'estimate'

  return (
    <span
      className={cn(
        'inline-flex items-baseline gap-1.5',
        size === 'sm' ? 'text-[11px]' : 'text-[13px]',
        className,
      )}
    >
      <Footprints
        className={cn(
          'self-center',
          size === 'sm' ? 'size-3' : 'size-3.5',
        )}
      />
      <span className="font-bold">
        {estimated ? '~' : ''}
        {formatWalkTime(route.durationSeconds)} walk
      </span>
      <span className="font-medium text-ink-muted">
        · {formatWalkDistance(route.distanceMeters)}
        {estimated ? ' est.' : ''}
      </span>
    </span>
  )
}
