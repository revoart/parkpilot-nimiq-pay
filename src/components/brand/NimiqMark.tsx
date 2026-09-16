import { cn } from '@/utils/cn'

/**
 * Nimiq account mark — the blue disc with the orange core, as it appears in the
 * Figma wallet pill and profile avatar. Inline so it stays crisp at any size and
 * needs no network request.
 */
export function NimiqMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
      className={cn('shrink-0', className)}
    >
      <circle cx="16" cy="16" r="16" fill="#2E6BFF" />
      <circle cx="16" cy="16" r="8.25" fill="#F59E0B" />
    </svg>
  )
}
