import { cn } from '@/utils/cn'

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn('animate-pulse rounded-xl bg-line/70', className)}
      aria-hidden="true"
    />
  )
}

/**
 * Mirrors the horizontal ParkingCard so the loading state matches the real
 * layout instead of a generic bar.
 */
export function ParkingCardSkeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'w-full rounded-2xl border border-line bg-surface-raised p-2.5',
        className,
      )}
    >
      <div className="flex gap-3">
        <Skeleton className="size-[76px] shrink-0 rounded-xl" />
        <div className="flex min-w-0 flex-1 flex-col gap-2 py-1">
          <div className="flex items-center justify-between gap-2">
            <Skeleton className="h-4 w-3/5" />
            <Skeleton className="h-5 w-14 shrink-0 rounded-full" />
          </div>
          <Skeleton className="h-3 w-2/5" />
          <div className="mt-auto flex items-center justify-between gap-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-10" />
          </div>
        </div>
      </div>
    </div>
  )
}
