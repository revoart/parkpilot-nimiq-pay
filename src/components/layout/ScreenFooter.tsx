import type { ReactNode } from 'react'

import { cn } from '@/utils/cn'

/**
 * The pinned action bar at the bottom of a screen.
 *
 * It is `sticky`, not `fixed`, and it lives in the shell's flex column rather
 * than floating over the content. That matters: a sticky bar occupies its own
 * space in the layout, so nothing is ever hidden behind it and there is no
 * padding to keep in sync. A `fixed` bar would sit over the last field of a
 * form, and would need the content padding to match its height by hand.
 *
 * The safe-area inset belongs to whichever bar is bottom-most, and is applied
 * *inside* it so that bar's own background covers the inset. Applied to the
 * wrapper instead, it renders as a blank strip below the bar's border. When a
 * nav sits underneath, the nav carries the inset and this footer must not.
 */
export function ScreenFooter({
  children,
  safeArea = true,
  className,
}: {
  children: ReactNode
  /** False when a nav renders below this footer and owns the inset itself. */
  safeArea?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        // No `pb-*`: `safe-bottom` sets `padding-bottom` outright and, being
        // unlayered CSS, it beats Tailwind's layered utilities — a utility here
        // would be dead code.
        'border-t border-line bg-surface-raised/95 px-4 pt-3 backdrop-blur-sm',
        safeArea && 'safe-bottom',
        className,
      )}
    >
      {children}
    </div>
  )
}
