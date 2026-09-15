import { Target } from 'lucide-react'

import { WalkBadge } from '@/components/journey/WalkBadge'
import type { WalkingRoute } from '@/lib/routing'
import type { Destination } from '@/types'
import { cn } from '@/utils/cn'

interface DestinationCardProps {
  destination: Destination
  route?: WalkingRoute | null
  /** Label above the walk line, e.g. "From selected parking". */
  caption?: string
  className?: string
}

/** Reusable destination block: search, detail, reserve, payment, pass, session. */
export function DestinationCard({
  destination,
  route = null,
  caption = 'From selected parking',
  className,
}: DestinationCardProps) {
  return (
    <div className={cn('rounded-2xl bg-surface p-4', className)}>
      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[1.2px] text-ink-faint">
        <Target className="size-3.5" />
        Your destination
      </p>
      <p className="mt-1.5 text-[15px] font-bold leading-snug">
        {destination.name}
      </p>
      {destination.address ? (
        <p className="mt-0.5 text-xs text-ink-muted">{destination.address}</p>
      ) : null}
      {route ? (
        <p className="mt-2 flex flex-wrap items-center gap-x-1.5 text-xs text-ink-muted">
          <span>{caption}</span>
          <WalkBadge route={route} size="sm" />
        </p>
      ) : null}
    </div>
  )
}
