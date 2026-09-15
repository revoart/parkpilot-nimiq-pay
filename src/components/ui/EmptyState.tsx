import type { ReactNode } from 'react'

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2.5 rounded-2xl border border-dashed border-line bg-surface-raised px-5 py-7 text-center">
      {icon ? (
        <span className="flex size-10 items-center justify-center rounded-xl bg-surface text-ink-muted">
          {icon}
        </span>
      ) : null}
      <div className="space-y-0.5">
        <p className="text-[13.5px] font-semibold">{title}</p>
        {description ? (
          <p className="text-xs leading-snug text-ink-muted">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  )
}
