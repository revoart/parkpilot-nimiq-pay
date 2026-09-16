import type { HTMLAttributes } from 'react'

import { cn } from '@/utils/cn'

export function Card({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-line-strong bg-surface-raised p-3.5 shadow-[0_4px_12px_rgba(0,0,0,0.04)] dark:border-line',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}
