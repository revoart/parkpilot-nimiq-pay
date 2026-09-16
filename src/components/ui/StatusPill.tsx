import type { ReactNode } from 'react'

import { cn } from '@/utils/cn'

export type PillTone = 'neutral' | 'success' | 'warning' | 'danger' | 'accent'

const toneClasses: Record<PillTone, string> = {
  neutral: 'bg-surface text-ink-soft',
  success: 'bg-success-bg text-success',
  warning: 'bg-warning-bg text-warning',
  danger: 'bg-danger-bg text-danger',
  accent: 'bg-brand/12 text-brand',
}

/** Filled pills, used by the ParkPilot Pick and spot-count badges. */
const solidClasses: Record<PillTone, string> = {
  neutral: 'bg-ink text-on-ink',
  success: 'bg-success text-white',
  warning: 'bg-star text-white',
  danger: 'bg-danger text-white',
  accent: 'bg-brand-fill text-brand-fg',
}

export function StatusPill({
  tone = 'neutral',
  solid = false,
  children,
  className,
}: {
  tone?: PillTone
  solid?: boolean
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold',
        solid ? solidClasses[tone] : toneClasses[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}
