import type { ReactNode } from 'react'

import { cn } from '@/utils/cn'

export type PillTone = 'neutral' | 'success' | 'warning' | 'danger' | 'accent'

const toneClasses: Record<PillTone, string> = {
  neutral: 'bg-surface text-ink-soft',
  success: 'bg-success-bg text-success',
  warning: 'bg-warning-bg text-warning',
  danger: 'bg-danger-bg text-danger',
  accent: 'bg-blue-50 text-blue-700',
}

export function StatusPill({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: PillTone
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold',
        toneClasses[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}
