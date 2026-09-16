import { cn } from '@/utils/cn'

/**
 * Chain badge from the Figma component sheet — uppercase label on a tinted
 * capsule. There is only one network now: payments are NIM on the Nimiq chain,
 * so this is deliberately narrow rather than a generic chain registry.
 */
export function ChainBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md bg-brand/12 px-1.5 py-[3px] text-[10px] font-extrabold uppercase leading-none tracking-[0.4px] text-brand',
        className,
      )}
    >
      Nimiq
    </span>
  )
}
