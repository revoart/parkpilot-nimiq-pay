import { useTheme } from '@/hooks/useTheme'
import { cn } from '@/utils/cn'

/**
 * ParkPilot logo — the original supplied SVG, rendered as a normal vector
 * image (filled paths, `stroke="none"`, transparent background).
 *
 * The black artwork is used as-is in light mode; a controlled white variant
 * (`fill="#FFFFFF"`, same paths) is used on dark backgrounds. No CSS fill,
 * stroke, or filter overrides are applied.
 */
const LOGO_BLACK = '/parkpilot-logo.svg'
const LOGO_WHITE = '/parkpilot-logo-white.svg'

export function ParkPilotMark({ className }: { className?: string }) {
  const { theme } = useTheme()

  return (
    <img
      src={theme === 'dark' ? LOGO_WHITE : LOGO_BLACK}
      alt="ParkPilot"
      draggable={false}
      className={cn('h-6 w-auto select-none object-contain', className)}
    />
  )
}

/** Full lockup: mark + wordmark. */
export function ParkPilotLogo({
  className,
  markClassName,
}: {
  className?: string
  markClassName?: string
}) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <ParkPilotMark className={cn('h-6 w-auto', markClassName)} />
      <span className="text-[15px] font-extrabold tracking-[-0.3px] text-ink">
        ParkPilot
      </span>
    </span>
  )
}
