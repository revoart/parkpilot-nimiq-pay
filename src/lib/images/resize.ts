/**
 * Shrink listing photos before they are uploaded.
 *
 * Hosts upload whatever their camera produced — one real listing photo on this
 * project is 4.45 MB. A search returning twenty listings was pulling roughly
 * 89 MB to fill thumbnails a few hundred pixels wide, which is the single
 * biggest reason the app feels slow on a phone.
 *
 * Supabase's on-the-fly resizing would fix the read side but is a paid-plan
 * feature and returns 404 here, so the work has to happen at upload. Resizing
 * once on the way in makes every future view fast, instead of paying to shrink
 * the same image on every request.
 */

/** Longest edge kept, in pixels. Comfortably sharp on a phone at 2x. */
export const MAX_UPLOAD_EDGE = 1200

/** WebP quality. 0.82 is visually lossless for photographs at this size. */
export const UPLOAD_QUALITY = 0.82

/**
 * Scale a width/height to fit inside a square of `maxEdge`, preserving aspect
 * ratio. Never enlarges — a small image stays its original size.
 */
export function fitWithin(
  width: number,
  height: number,
  maxEdge: number = MAX_UPLOAD_EDGE,
): { width: number; height: number } {
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return { width: 0, height: 0 }
  }
  if (width <= 0 || height <= 0) return { width: 0, height: 0 }

  const longest = Math.max(width, height)
  if (longest <= maxEdge) {
    return { width: Math.round(width), height: Math.round(height) }
  }

  const scale = maxEdge / longest
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

function swapExtension(name: string): string {
  const base = name.replace(/\.[^.]+$/, '')
  return `${base || 'photo'}.webp`
}

/**
 * Resize and re-encode an image file for upload.
 *
 * Returns the original file whenever anything is uncertain — a non-image, a
 * format the browser cannot decode, a canvas that produces nothing, or an
 * "optimised" result that is not actually smaller. A failed optimisation must
 * never block an upload; the photo is the point.
 */
export async function resizeImageForUpload(
  file: File,
  maxEdge: number = MAX_UPLOAD_EDGE,
  quality: number = UPLOAD_QUALITY,
): Promise<File> {
  try {
    if (!file.type.startsWith('image/')) return file
    // SVG and GIF would lose animation or vector sharpness. Leave them alone.
    if (file.type === 'image/svg+xml' || file.type === 'image/gif') return file

    const bitmap = await createImageBitmap(file)
    const target = fitWithin(bitmap.width, bitmap.height, maxEdge)
    if (target.width <= 0 || target.height <= 0) return file

    // Nothing to gain if it is already within the limit and already compressed.
    const alreadySmall =
      bitmap.width <= maxEdge && bitmap.height <= maxEdge && file.size < 300_000

    const canvas = document.createElement('canvas')
    canvas.width = target.width
    canvas.height = target.height

    const context = canvas.getContext('2d')
    if (!context) return file

    context.drawImage(bitmap, 0, 0, target.width, target.height)
    bitmap.close?.()

    if (alreadySmall) return file

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/webp', quality)
    })
    if (!blob) return file

    // Re-encoding can occasionally grow a file. Keep whichever is smaller.
    if (blob.size >= file.size) return file

    return new File([blob], swapExtension(file.name), {
      type: 'image/webp',
      lastModified: Date.now(),
    })
  } catch {
    // Any failure at all: upload the original rather than nothing.
    return file
  }
}
