import { cn } from '@/utils/cn'

/**
 * Tether (USDT) mark used inside the price pill on parking cards. Drawn inline
 * so the price pill renders identically offline and inside Nimiq Pay.
 */
export function UsdtMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
      className={cn('shrink-0', className)}
    >
      <circle cx="16" cy="16" r="16" fill="#26A17B" />
      <rect x="7.5" y="9" width="17" height="3.2" rx="1.6" fill="#fff" />
      <rect x="9.5" y="14" width="13" height="3.2" rx="1.6" fill="#fff" />
      <rect x="14.3" y="9" width="3.4" height="15" rx="1.7" fill="#fff" />
    </svg>
  )
}
