import type { HTMLAttributes } from 'react'

import { cn } from '@/utils/cn'

export function Card({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-2xl bg-surface-raised p-3.5', className)}
      {...props}
    >
      {children}
    </div>
  )
}
