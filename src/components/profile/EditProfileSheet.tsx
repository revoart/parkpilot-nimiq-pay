import { Camera } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Avatar } from '@/components/profile/Avatar'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { useProfile } from '@/hooks/useProfile'

interface EditProfileSheetProps {
  open: boolean
  onClose: () => void
}

/**
 * Edits the one shared identity. Whatever is saved here shows up in both the
 * Driver and Host experiences.
 */
export function EditProfileSheet({ open, onClose }: EditProfileSheetProps) {
  const { profile, save, setAvatar } = useProfile()
  const toast = useToast()
  const fileInput = useRef<HTMLInputElement | null>(null)

  const [name, setName] = useState('')
  const [bio, setBio] = useState('')
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName(profile?.display_name ?? '')
    setBio(profile?.bio ?? '')
    setPreview(null)
    setError(null)
  }, [open, profile])

  async function handleAvatar(file: File | null) {
    if (!file) return
    setError(null)
    setPreview(URL.createObjectURL(file))
    setBusy(true)
    try {
      await setAvatar(file)
    } catch (err) {
      setPreview(null)
      setError(err instanceof Error ? err.message : 'Could not upload the photo.')
    } finally {
      setBusy(false)
    }
  }

  async function handleSave() {
    setError(null)
    setBusy(true)
    try {
      await save({ displayName: name.trim() || null, bio: bio.trim() || null })
      toast.show('Profile saved.', 'success')
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <BottomSheet open={open} title="Edit profile" onClose={onClose}>
      <div className="space-y-4 pb-2">
        <div className="flex items-center gap-4">
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(event) => void handleAvatar(event.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="relative"
            aria-label="Change profile photo"
          >
            <Avatar
              url={preview ?? profile?.avatar_url ?? null}
              name={name || profile?.display_name || null}
              address={profile?.evm_address ?? null}
              className="size-16 rounded-[20px]"
            />
            <span className="absolute -right-1 -bottom-1 flex size-6 items-center justify-center rounded-full bg-ink text-on-ink">
              <Camera className="size-3" />
            </span>
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Profile photo</p>
            <p className="text-xs text-ink-muted">
              Shown in both Driver and Host.
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="profile-name"
            className="text-xs font-semibold text-ink-soft"
          >
            Name
          </label>
          <input
            id="profile-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={60}
            placeholder="Your name"
            className="w-full rounded-xl bg-surface px-3.5 py-3 text-[14px] outline-none placeholder:text-ink-faint"
          />
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="profile-bio"
            className="text-xs font-semibold text-ink-soft"
          >
            Bio
          </label>
          <textarea
            id="profile-bio"
            value={bio}
            onChange={(event) => setBio(event.target.value)}
            maxLength={240}
            rows={3}
            placeholder="A short line about you (optional)"
            className="w-full resize-none rounded-xl bg-surface px-3.5 py-3 text-[13px] outline-none placeholder:text-ink-faint"
          />
        </div>

        {error ? <p className="text-sm text-danger">{error}</p> : null}

        <Button full size="lg" onClick={() => void handleSave()} loading={busy}>
          Save profile
        </Button>
      </div>
    </BottomSheet>
  )
}
