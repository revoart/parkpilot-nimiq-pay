import { SquareParking } from 'lucide-react'

import { cn } from '@/utils/cn'

interface ListingPhotoProps {
  imageUrl: string | null | undefined
  title: string
  className?: string
}

/**
 * The listing's single photo. Falls back to a subtle branded tile (never a
 * broken-image icon or a blank white box) so listings without a photo still
 * look intentional.
 */
export function ListingPhoto({ imageUrl, title, className }: ListingPhotoProps) {
  if (!imageUrl) {
    return (
      <div
        className={cn(
          'flex items-center justify-center bg-map',
          className,
        )}
        role="img"
        aria-label={`${title} — no photo yet`}
      >
        <SquareParking className="size-7 text-ink-faint" strokeWidth={1.75} />
      </div>
    )
  }

  return (
    <img
      src={imageUrl}
      alt={title}
      loading="lazy"
      decoding="async"
      className={cn('bg-map object-cover', className)}
    />
  )
}
