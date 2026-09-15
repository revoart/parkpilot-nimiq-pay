import { createClient } from 'npm:@supabase/supabase-js@2'

import { readToken, verifyToken } from '../_shared/auth.ts'
import { errorResponse, json, preflight } from '../_shared/http.ts'

const BUCKET = 'parking-photos'
const MAX_BYTES = 5 * 1024 * 1024

const ALLOWED: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

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

/** Uploads the shared profile avatar. One image, owned by the calling wallet. */
Deno.serve(async (request) => {
  const options = preflight(request)
  if (options) return options
  if (request.method !== 'POST') {
    return errorResponse(request, 'Method not allowed', 405)
  }

  try {
    const form = await request.formData().catch(() => null)
    if (!form) return errorResponse(request, 'Expected multipart/form-data.')

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
    if (file.size === 0) return errorResponse(request, 'The image file is empty.')
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

    const path = `avatars/${ownerAddress}/${crypto.randomUUID()}.${extension}`

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: declared, upsert: false })
    if (uploadError) throw uploadError

    const { data: publicUrlData } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(path)

    return json(request, { avatar_url: publicUrlData.publicUrl })
  } catch (error) {
    console.error('upload-avatar failed', error)
    return errorResponse(
      request,
      error instanceof Error ? error.message : 'Unexpected error',
      500,
    )
  }
})
