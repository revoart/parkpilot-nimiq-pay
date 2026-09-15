import { cn } from '@/utils/cn'

export function Toggle({
  on,
  onChange,
  ariaLabel,
}: {
  on: boolean
  onChange: () => void
  ariaLabel?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel}
      onClick={onChange}
      className={cn(
        'relative inline-flex h-7 w-12 shrink-0 rounded-full transition-colors duration-200',
        on ? 'bg-ink' : 'bg-line-strong',
      )}
    >
      <span
        className={cn(
          'absolute top-1 size-5 rounded-full bg-surface-raised shadow-sm transition-transform duration-200',
          on ? 'translate-x-6' : 'translate-x-1',
        )}
      />
    </button>
  )
}
