import { cn } from '@/utils/cn'

interface AvatarProps {
  url: string | null
  name: string | null
  address: string | null
  className?: string
}

/** Shared profile photo with an initials fallback. */
export function Avatar({ url, name, address, className }: AvatarProps) {
  const initials =
    name?.trim().slice(0, 2).toUpperCase() ||
    (address ? address.slice(2, 4).toUpperCase() : 'PP')

  if (url) {
    return (
      <img
        src={url}
        alt={name ?? 'Profile photo'}
        className={cn('bg-surface object-cover', className)}
      />
    )
  }

  return (
    <div
      className={cn(
        'flex items-center justify-center bg-gradient-to-br from-surface to-line',
        className,
      )}
    >
      <span className="text-[19px] font-bold text-ink-soft">{initials}</span>
    </div>
  )
}
