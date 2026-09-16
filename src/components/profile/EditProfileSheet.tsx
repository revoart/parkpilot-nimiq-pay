import { Camera } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Avatar } from '@/components/profile/Avatar'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { Toggle } from '@/components/ui/Toggle'
import { useToast } from '@/components/ui/Toast'
import { useProfile } from '@/hooks/useProfile'
import { normalizePhone } from '@/utils/phone'

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
  const [phone, setPhone] = useState('')
  const [phoneShared, setPhoneShared] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName(profile?.display_name ?? '')
    setBio(profile?.bio ?? '')
    setPhone(profile?.phone ?? '')
    setPhoneShared(profile?.phone_shared ?? false)
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

    // Validate here as well as on the server, so the user finds out before a
    // round trip rather than after.
    const trimmedPhone = phone.trim()
    const normalized = trimmedPhone ? normalizePhone(trimmedPhone) : null
    if (trimmedPhone && !normalized) {
      setError('Enter a valid phone number: 8 to 15 digits, optionally starting with +.')
      return
    }

    setBusy(true)
    try {
      await save({
        displayName: name.trim() || null,
        bio: bio.trim() || null,
        phone: normalized,
        // A number that is not set cannot be shared.
        phoneShared: normalized ? phoneShared : false,
      })
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

        <div className="space-y-1.5">
          <label
            htmlFor="profile-phone"
            className="text-xs font-semibold text-ink-soft"
          >
            Phone number
          </label>
          <input
            id="profile-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="+1 416 555 1234"
            className="w-full rounded-xl bg-surface px-3.5 py-3 text-[14px] outline-none placeholder:text-ink-faint"
          />
          <p className="text-[11px] leading-4 text-ink-muted">
            Optional. Used so a host or driver can call you about a booking.
          </p>
        </div>

        <div className="flex items-start gap-3 rounded-xl bg-surface p-3.5">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Share my number</p>
            <p className="mt-0.5 text-[11px] leading-4 text-ink-muted">
              Only visible to someone you have a booking with, and only while that
              booking is active. Off by default.
            </p>
          </div>
          <Toggle
            on={phoneShared}
            ariaLabel="Share my phone number with booking counterparties"
            onChange={() => setPhoneShared((current) => !current)}
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
