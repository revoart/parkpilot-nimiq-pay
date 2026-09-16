import type { ButtonHTMLAttributes } from 'react'

import { cn } from '@/utils/cn'
import { haptic } from '@/utils/haptics'

type Variant =
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'ghost'
  | 'danger'
  | 'accent'
  | 'warning'
type Size = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  full?: boolean
  loading?: boolean
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
    />
  )
}

export function Button({
  variant = 'primary',
  size = 'md',
  full = false,
  loading = false,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex cursor-pointer select-none items-center justify-center font-semibold transition-all active:scale-[0.97] active:opacity-90 disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' && 'h-9 rounded-xl px-3.5 text-[13px]',
        size === 'md' && 'h-11 rounded-xl px-4 text-[14px]',
        size === 'lg' && 'h-12 rounded-xl px-5 text-[15px]',
        variant === 'primary' &&
          'bg-brand-fill text-brand-fg shadow-[0_4px_12px_rgba(76,130,255,0.12)]',
        variant === 'secondary' &&
          'border border-line-strong bg-surface-raised text-ink',
        variant === 'outline' && 'border border-line-strong text-ink',
        variant === 'ghost' && 'text-brand',
        variant === 'danger' && 'bg-danger-bg text-danger',
        variant === 'accent' && 'bg-accent text-on-ink',
        variant === 'warning' && 'border border-warning text-warning',
        full && 'w-full',
        className,
      )}
      disabled={disabled || loading}
      onPointerDown={(event) => {
        if (!disabled && !loading) haptic()
        props.onPointerDown?.(event)
      }}
      {...props}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  )
}
