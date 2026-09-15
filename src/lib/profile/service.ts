import { requireToken } from '@/lib/auth'
import { getSupabase } from '@/lib/supabase/client'
import { readFunctionError } from '@/lib/supabase/functions'
import { requireSupabase } from '@/utils/env'

/** The single shared ParkPilot identity — used by Driver and Host alike. */
export interface Profile {
  display_name: string | null
  bio: string | null
  avatar_url: string | null
  evm_address: string
}

export const MAX_AVATAR_BYTES = 5 * 1024 * 1024
const ALLOWED_AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp']

function normalize(row: Record<string, unknown> | undefined): Profile {
  return {
    display_name: (row?.display_name as string | null) ?? null,
    bio: (row?.bio as string | null) ?? null,
    avatar_url: (row?.avatar_url as string | null) ?? null,
    evm_address: String(row?.evm_address ?? ''),
  }
}

export async function getProfile(evmAddress: string): Promise<Profile> {
  const supabase = getSupabase()
  const authToken = await requireToken(evmAddress)
  const { data, error } = await supabase.functions.invoke('get-profile', {
    body: { evm_address: evmAddress, auth_token: authToken },
  })

  if (error) {
    throw new Error(await readFunctionError(error, 'Could not load your profile.'))
  }

  const payload = data as { profile?: Record<string, unknown>; error?: string } | null
  if (!payload || payload.error) {
    throw new Error(payload?.error ?? 'Could not load your profile.')
  }

  return normalize(payload.profile)
}

export async function updateProfile(
  evmAddress: string,
  input: {
    displayName?: string | null
    bio?: string | null
    avatarUrl?: string | null
  },
): Promise<Profile> {
  const supabase = getSupabase()
  const authToken = await requireToken(evmAddress)

  const body: Record<string, unknown> = {
    evm_address: evmAddress,
    auth_token: authToken,
  }
  if (input.displayName !== undefined) body.display_name = input.displayName
  if (input.bio !== undefined) body.bio = input.bio
  if (input.avatarUrl !== undefined) body.avatar_url = input.avatarUrl

  const { data, error } = await supabase.functions.invoke('update-profile', {
    body,
  })

  if (error) {
    throw new Error(await readFunctionError(error, 'Could not save your profile.'))
  }

  const payload = data as { profile?: Record<string, unknown>; error?: string } | null
  if (!payload || payload.error) {
    throw new Error(payload?.error ?? 'Could not save your profile.')
  }

  return normalize(payload.profile)
}

/** Uploads the profile photo; returns its public URL (not yet persisted). */
export async function uploadAvatar(
  evmAddress: string,
  file: File,
): Promise<string> {
  if (!ALLOWED_AVATAR_TYPES.includes(file.type.toLowerCase())) {
    throw new Error('Use a JPEG, PNG or WebP image.')
  }
  if (file.size > MAX_AVATAR_BYTES) {
    throw new Error('Image must be 5 MB or smaller.')
  }

  const { url, anonKey } = requireSupabase()
  const authToken = await requireToken(evmAddress)

  const form = new FormData()
  form.append('file', file)
  form.set('auth_token', authToken)

  const response = await fetch(`${url}/functions/v1/upload-avatar`, {
    method: 'POST',
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    body: form,
  })

  const payload = (await response.json().catch(() => null)) as
    | { avatar_url?: string; error?: string }
    | null

  if (!response.ok || !payload?.avatar_url) {
    throw new Error(payload?.error ?? 'Could not upload the photo.')
  }

  return payload.avatar_url
}
