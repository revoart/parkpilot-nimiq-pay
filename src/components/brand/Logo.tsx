import { useId } from 'react'

import { cn } from '@/utils/cn'

/**
 * ParkPilot logo — a squircle containing an open arch and a "P".
 *
 * The geometry is Figma's own export, used verbatim. In particular the inner
 * shape is a masked path, and it must stay that way: it resolves to three bands
 * (top, left, right) with the bottom open, i.e. an arch. Expressing it as a
 * closed square frame adds a bottom bar that the design does not have.
 *
 * The artwork is monochrome, so the painted elements use `currentColor`: solid
 * black on the light theme and solid white on the dark theme from one
 * definition, with no theme lookup and no second file to drift out of sync.
 */
export function ParkPilotMark({
  className,
  label,
}: {
  className?: string
  /** Supply a name to announce the mark; omit it when a wordmark sits beside it. */
  label?: string
}) {
  // `useId` returns a value like ":r0:", and a raw colon inside `url(#…)` is not
  // a valid reference — so it is stripped. This keeps the mask id unique, which
  // matters when the mark renders more than once on a page.
  const maskId = `pp-arch-${useId().replace(/:/g, '')}`

  return (
    <svg
      viewBox="0 0 200 200"
      fill="none"
      className={cn('shrink-0', className)}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      <rect
        x="7"
        y="7"
        width="186"
        height="186"
        rx="45"
        stroke="currentColor"
        strokeWidth="14"
      />
      {/* The mask stays opaque; only the painted paths follow the theme. */}
      <mask id={maskId} fill="white">
        <path d="M42 42H158V158H42V42Z" />
      </mask>
      <path
        d="M42 42V30H30V42H42ZM158 42H170V30H158V42ZM42 42V54H158V42V30H42V42ZM158 42H146V158H158H170V42H158ZM42 158H54V42H42H30V158H42Z"
        fill="currentColor"
        mask={`url(#${maskId})`}
      />
      <rect x="79" y="93" width="12" height="48" fill="currentColor" />
      <path
        d="M108 84C115.18 84 121 89.8203 121 97C121 104.18 115.18 110 108 110H85V84H108Z"
        stroke="currentColor"
        strokeWidth="12"
      />
    </svg>
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
