import type { ReactNode } from 'react'

import { cn } from '@/utils/cn'

export type StateTone = 'danger' | 'warning' | 'success' | 'brand' | 'neutral'

const toneClasses: Record<StateTone, string> = {
  danger: 'bg-danger-bg text-danger',
  warning: 'bg-warning-bg text-warning',
  success: 'bg-success-bg text-success',
  brand: 'bg-brand/12 text-brand',
  neutral: 'bg-surface text-ink-soft',
}

/**
 * Full-width presentation for a terminal screen state (error, empty, success).
 * Distinct from EmptyState, which is the dashed in-flow placeholder used inside
 * content lists.
 */
export function StateCard({
  tone = 'neutral',
  icon,
  title,
  description,
  children,
  className,
}: {
  tone?: StateTone
  icon: ReactNode
  title: string
  description?: string
  children?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex w-full flex-col items-center rounded-2xl bg-surface-raised px-5 py-7 text-center shadow-[0_4px_12px_rgba(0,0,0,0.04)]',
        className,
      )}
    >
      <span
        className={cn(
          'flex size-14 items-center justify-center rounded-full',
          toneClasses[tone],
        )}
      >
        {icon}
      </span>
      <p
        className="mt-4 text-[20px] font-extrabold tracking-[-0.3px]"
        role="status"
      >
        {title}
      </p>
      {description ? (
        <p className="mt-2 text-[14px] leading-5 text-ink-muted">
          {description}
        </p>
      ) : null}
      {children ? (
        <div className="mt-5 w-full space-y-2.5">{children}</div>
      ) : null}
    </div>
  )
}
