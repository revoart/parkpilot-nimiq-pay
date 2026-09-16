import { cn } from '@/utils/cn'

/**
 * Chain badge from the Figma component sheet — uppercase label on a 12% tint of
 * the chain colour. Only Polygon is supported today, so the component is
 * deliberately narrow rather than a generic registry.
 */
export function ChainBadge({
  chain = 'polygon',
  className,
}: {
  chain?: 'polygon'
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-1.5 py-[3px] text-[10px] font-extrabold uppercase leading-none tracking-[0.4px]',
        chain === 'polygon' && 'bg-polygon/12 text-polygon',
        className,
      )}
    >
      Polygon
    </span>
  )
}
