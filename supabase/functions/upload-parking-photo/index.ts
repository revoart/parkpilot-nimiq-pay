import { createClient } from 'npm:@supabase/supabase-js@2'

import { readToken, verifyToken } from '../_shared/auth.ts'
import { errorResponse, json, preflight } from '../_shared/http.ts'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const BUCKET = 'parking-photos'
const MAX_BYTES = 5 * 1024 * 1024

/** Allowed image types → file extension. */
const ALLOWED: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

/**
 * Sniff the real format from the leading bytes so a renamed non-image cannot
 * pass validation on its declared MIME type alone.
 */
function sniff(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg'
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'png'
  }
  const riff = String.fromCharCode(...bytes.slice(0, 4))
  const webp = String.fromCharCode(...bytes.slice(8, 12))
  if (riff === 'RIFF' && webp === 'WEBP') return 'webp'
  return null
}

/** Recover the object path from a stored public URL (so the old file can go). */
function objectPath(publicUrl: string | null): string | null {
  if (!publicUrl) return null
  const marker = `/storage/v1/object/public/${BUCKET}/`
  const index = publicUrl.indexOf(marker)
  if (index === -1) return null
  const path = publicUrl.slice(index + marker.length).split('?')[0]
  return path || null
}

/**
 * Uploads the single photo for a parking listing (or a pre-listing upload before
 * the listing exists). Replaces any previous photo so a listing can never end up
 * with more than one, and verifies the caller owns the listing.
 */
Deno.serve(async (request) => {
  const options = preflight(request)
  if (options) return options
  if (request.method !== 'POST') {
    return errorResponse(request, 'Method not allowed', 405)
  }

  try {
    const form = await request.formData().catch(() => null)
    if (!form) {
      return errorResponse(request, 'Expected multipart/form-data.')
    }

    const owner = await verifyToken(
      readToken(request, { auth_token: String(form.get('auth_token') ?? '') }),
    )
    if (!owner) {
      return errorResponse(request, 'Sign in with your wallet to continue.', 401)
    }
    const ownerAddress = owner.toLowerCase()

    const file = form.get('file')
    if (!(file instanceof File)) {
      return errorResponse(request, 'No image file was provided.')
    }
    if (file.size === 0) {
      return errorResponse(request, 'The image file is empty.')
    }
    if (file.size > MAX_BYTES) {
      return errorResponse(request, 'Image must be 5 MB or smaller.')
    }

    const declared = (file.type || '').toLowerCase()
    const extension = ALLOWED[declared]
    if (!extension) {
      return errorResponse(request, 'Use a JPEG, PNG or WebP image.')
    }

    const bytes = new Uint8Array(await file.arrayBuffer())
    const detected = sniff(bytes)
    if (!detected || detected !== extension) {
      return errorResponse(request, 'That file is not a valid image.')
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const rawId = form.get('parking_space_id')
    const parkingSpaceId =
      typeof rawId === 'string' && rawId.length > 0 ? rawId : null

    if (parkingSpaceId && !UUID_RE.test(parkingSpaceId)) {
      return errorResponse(request, 'Invalid parking space id.')
    }

    let previousUrl: string | null = null

    if (parkingSpaceId) {
      // Only the host who owns the listing may change its photo.
      const { data: existing, error: findError } = await supabase
        .from('parking_spaces')
        .select('id, image_url')
        .eq('id', parkingSpaceId)
        .ilike('owner_nimiq_address', ownerAddress)
        .maybeSingle()

      if (findError) throw findError
      if (!existing) {
        return errorResponse(request, 'Parking space not found.', 404)
      }
      previousUrl = existing.image_url ?? null
    }

    const path = `${ownerAddress}/${crypto.randomUUID()}.${extension}`

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: declared, upsert: false })

    if (uploadError) throw uploadError

    const { data: publicUrlData } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(path)
    const imageUrl = publicUrlData.publicUrl

    if (parkingSpaceId) {
      const { error: updateError } = await supabase
        .from('parking_spaces')
        .update({ image_url: imageUrl, updated_at: new Date().toISOString() })
        .eq('id', parkingSpaceId)
        .ilike('owner_nimiq_address', ownerAddress)

      if (updateError) throw updateError

      // Exactly one photo: drop the object this one replaces.
      const oldPath = objectPath(previousUrl)
      if (oldPath && oldPath !== path) {
        await supabase.storage.from(BUCKET).remove([oldPath])
      }
    }

    return json(request, { image_url: imageUrl, path })
  } catch (error) {
    console.error('upload-parking-photo failed', error)
    return errorResponse(
      request,
      error instanceof Error ? error.message : 'Unexpected error',
      500,
    )
  }
})
