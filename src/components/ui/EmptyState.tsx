import { AlertTriangle } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/utils/cn'

export function EmptyState({
  icon,
  title,
  description,
  action,
  tone = 'default',
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
  tone?: 'default' | 'danger'
}) {
  const danger = tone === 'danger'
  const glyph = icon ?? (danger ? <AlertTriangle className="size-6" /> : null)

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-4 rounded-2xl px-5 py-8 text-center',
        danger
          ? 'border border-line bg-surface-raised shadow-[0_4px_12px_rgba(0,0,0,0.04)]'
          : 'border border-dashed border-line-strong',
      )}
    >
      {glyph ? (
        <span
          className={cn(
            'flex size-14 items-center justify-center rounded-full',
            danger ? 'bg-danger-bg text-danger' : 'bg-brand/10 text-brand',
          )}
        >
          {glyph}
        </span>
      ) : null}
      <div className="space-y-1.5">
        <p className="text-[17px] font-bold tracking-[-0.3px] text-ink">{title}</p>
        {description ? (
          <p className="text-[14px] leading-snug text-ink-muted">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  )
}
