import { ImagePlus, SquareParking, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { AvailabilityEditor } from '@/components/host/AvailabilityEditor'
import { HostShell } from '@/components/layout/HostShell'
import { ListingPhoto } from '@/components/parking/ListingPhoto'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { StatusPill } from '@/components/ui/StatusPill'
import { useToast } from '@/components/ui/Toast'
import { Toggle } from '@/components/ui/Toggle'
import { useWallet } from '@/hooks/useWallet'
import {
  deleteParkingSpace,
  listHostSpaces,
  updateParkingSpace,
  uploadParkingPhoto,
  type HostSpace,
} from '@/lib/host'
import { cn } from '@/utils/cn'

const TYPES = [
  { value: 'garage', label: 'Garage' },
  { value: 'underground', label: 'Underground' },
  { value: 'lot', label: 'Parking lot' },
  { value: 'street', label: 'Street' },
]

export function HostSpaceScreen() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const wallet = useWallet()
  const toast = useToast()

  const [space, setSpace] = useState<HostSpace | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [title, setTitle] = useState('')
  const [address, setAddress] = useState('')
  const [price, setPrice] = useState('')
  const [parkingType, setParkingType] = useState('garage')
  const [description, setDescription] = useState('')
  const [covered, setCovered] = useState(false)
  const [evCharging, setEvCharging] = useState(false)
  const [accessible, setAccessible] = useState(false)

  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Exactly one photo. Removing it forces a replacement before saving.
  const fileInput = useRef<HTMLInputElement | null>(null)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [photoUploading, setPhotoUploading] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [photoRemoved, setPhotoRemoved] = useState(false)

  async function handlePhoto(file: File | null) {
    if (!file || !space || !wallet.address) return
    setPhotoError(null)
    setPhotoPreview(URL.createObjectURL(file))
    setPhotoUploading(true)
    try {
      const url = await uploadParkingPhoto(wallet.address, file, space.id)
      setPhotoUrl(url)
      setPhotoRemoved(false)
      setSpace({ ...space, image_url: url })
    } catch (err) {
      setPhotoPreview(null)
      setPhotoError(
        err instanceof Error ? err.message : 'Could not upload the photo.',
      )
    } finally {
      setPhotoUploading(false)
    }
  }

  function clearPhoto() {
    setPhotoUrl(null)
    setPhotoPreview(null)
    setPhotoError(null)
    setPhotoRemoved(true)
    if (fileInput.current) fileInput.current.value = ''
  }

  const load = useCallback(async () => {
    if (!wallet.address || !id) {
      setLoading(false)
      return
    }
    setLoading(true)
    setLoadError(null)
    try {
      const spaces = await listHostSpaces(wallet.address)
      const found = spaces.find((item) => item.id === id) ?? null
      setSpace(found)
      if (found) {
        setTitle(found.title)
        setAddress(found.address)
        setPrice(String(found.price_usdt))
        setParkingType(found.parking_type ?? 'garage')
        setDescription(found.description ?? '')
        setCovered(found.covered)
        setEvCharging(found.ev_charging)
        setAccessible(found.accessible)
        setPhotoUrl(found.image_url)
        setPhotoPreview(null)
        setPhotoRemoved(false)
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load.')
    } finally {
      setLoading(false)
    }
  }, [wallet.address, id])

  useEffect(() => {
    void load()
  }, [load])

  async function handleSave() {
    if (!space || !wallet.address) return
    setError(null)
    setMessage(null)

    const priceValue = Number(price)
    if (title.trim().length < 3) {
      setError('Title must be at least 3 characters.')
      return
    }
    if (!Number.isFinite(priceValue) || priceValue <= 0) {
      setError('Enter a valid hourly price.')
      return
    }
    if (!photoUrl) {
      setError(
        'Add a photo of your parking space to continue.',
      )
      return
    }

    setSaving(true)
    try {
      const updated = await updateParkingSpace({
        evmAddress: wallet.address,
        id: space.id,
        title: title.trim(),
        address: address.trim(),
        priceUsdt: priceValue,
        parkingType,
        description: description.trim() || null,
        covered,
        evCharging,
        accessible,
        imageUrl: photoUrl,
      })
      setSpace({ ...space, ...updated })
      toast.show('Listing updated.', 'success')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.')
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleActive() {
    if (!space || !wallet.address) return
    setError(null)
    setMessage(null)
    setSaving(true)
    try {
      const updated = await updateParkingSpace({
        evmAddress: wallet.address,
        id: space.id,
        active: !space.active,
      })
      setSpace({ ...space, ...updated })
      toast.show(updated.active ? 'Listing is live.' : 'Listing paused.', 'success')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!space || !wallet.address) return
    setError(null)
    setMessage(null)
    setDeleting(true)
    try {
      await deleteParkingSpace(wallet.address, space.id)
      navigate('/host')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete.')
      setConfirmDelete(false)
    } finally {
      setDeleting(false)
    }
  }

  if (!wallet.address) {
    return (
      <HostShell showBack title="Edit listing" showNav={false}>
        <EmptyState
          icon={<SquareParking className="size-5" />}
          title="Connect your wallet"
          description="Connect Nimiq Pay to manage this listing."
          action={
            <Button size="md" onClick={() => void wallet.connect()}>
              Connect Wallet
            </Button>
          }
        />
      </HostShell>
    )
  }

  if (loading) {
    return (
      <HostShell showBack title="Edit listing" showNav={false}>
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </HostShell>
    )
  }

  if (loadError || !space) {
    return (
      <HostShell showBack title="Edit listing" showNav={false}>
        <EmptyState
          title="Listing not found"
          description={
            loadError ?? 'This listing is not owned by the connected wallet.'
          }
          action={
            <Button variant="secondary" size="md" onClick={() => navigate('/host')}>
              Back to dashboard
            </Button>
          }
        />
      </HostShell>
    )
  }

  return (
    <HostShell showBack title="Edit listing" showNav={false}>
      <div className="space-y-3">
        <Card className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-xl bg-ink">
              <SquareParking className="size-4 text-on-ink" />
            </span>
            <div>
              <p className="text-sm font-semibold">{space.title}</p>
              <p className="text-xs text-ink-muted">
                {space.stats.bookings} bookings · {space.stats.earned} USDT earned
              </p>
            </div>
          </div>
          <StatusPill tone={space.active ? 'success' : 'neutral'}>
            {space.active ? 'Active' : 'Paused'}
          </StatusPill>
        </Card>

        <Card className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold">Parking photo</p>
            <span className="text-[11px] text-ink-muted">1 photo</span>
          </div>

          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label="Parking photo"
            className="hidden"
            onChange={(event) =>
              void handlePhoto(event.target.files?.[0] ?? null)
            }
          />

          <div className="relative overflow-hidden rounded-2xl">
            {photoUrl || photoPreview ? (
              <img
                src={photoUrl ?? photoPreview ?? ''}
                alt={space.title}
                className="h-36 w-full bg-map object-cover"
              />
            ) : (
              <ListingPhoto
                imageUrl={null}
                title={space.title}
                className="h-36 w-full"
              />
            )}
            {photoUploading ? (
              <span className="absolute inset-x-0 bottom-0 bg-ink/75 py-2 text-center text-[11px] font-semibold text-on-ink">
                Uploading…
              </span>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-line-strong px-3.5 py-2.5 text-[13px] font-semibold"
            >
              <ImagePlus className="size-4" />
              {photoUrl ? 'Replace Photo' : 'Add Photo'}
            </button>
            {photoUrl ? (
              <button
                type="button"
                onClick={clearPhoto}
                className="rounded-xl px-3.5 py-2.5 text-[13px] font-semibold text-ink-muted"
              >
                Remove
              </button>
            ) : null}
          </div>

          {photoRemoved && !photoUrl ? (
            <p className="rounded-xl bg-warning-bg px-3 py-2 text-xs font-medium text-warning">
              Add a photo of your parking space to continue.
            </p>
          ) : null}
          {photoError ? (
            <p className="text-sm text-danger">{photoError}</p>
          ) : null}
        </Card>

        <Card className="space-y-3">
          <div className="space-y-1.5">
            <label
              htmlFor="space-name"
              className="text-xs font-semibold text-ink-soft"
            >
              Name
            </label>
            <input
              id="space-name"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="w-full rounded-xl bg-surface px-3.5 py-3 text-[14px] outline-none"
            />
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="space-address"
              className="text-xs font-semibold text-ink-soft"
            >
              Address
            </label>
            <input
              id="space-address"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              className="w-full rounded-xl bg-surface px-3.5 py-3 text-[14px] outline-none"
            />
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="space-price"
              className="text-xs font-semibold text-ink-soft"
            >
              Hourly price (USDT)
            </label>
            <input
              id="space-price"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              inputMode="decimal"
              className="w-full rounded-xl bg-surface px-3.5 py-3 text-[14px] outline-none"
            />
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="space-description"
              className="text-xs font-semibold text-ink-soft"
            >
              Description
            </label>
            <textarea
              id="space-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              className="w-full resize-none rounded-xl bg-surface px-3.5 py-3 text-[13px] outline-none"
            />
          </div>
        </Card>

        <Card className="space-y-2">
          <p className="text-sm font-semibold">Type</p>
          <div className="grid grid-cols-2 gap-2">
            {TYPES.map((type) => (
              <button
                key={type.value}
                type="button"
                onClick={() => setParkingType(type.value)}
                className={cn(
                  'rounded-xl border py-3 text-sm font-semibold transition',
                  parkingType === type.value
                    ? 'border-ink bg-ink text-on-ink'
                    : 'border-line text-ink',
                )}
              >
                {type.label}
              </button>
            ))}
          </div>
        </Card>

        <Card className="overflow-hidden p-0">
          {(
            [
              ['Covered', covered, setCovered],
              ['EV charging', evCharging, setEvCharging],
              ['Accessible', accessible, setAccessible],
            ] as [string, boolean, (value: boolean) => void][]
          ).map(([label, value, setter], index, arr) => (
            <div key={label}>
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-[15px] font-medium">{label}</span>
                <Toggle
                  on={value}
                  ariaLabel={label}
                  onChange={() => setter(!value)}
                />
              </div>
              {index < arr.length - 1 ? (
                <div className="mx-4 h-px bg-line" />
              ) : null}
            </div>
          ))}
        </Card>

        <AvailabilityEditor parkingSpaceId={space.id} />

        {message ? <p className="text-sm text-success">{message}</p> : null}
        {error ? <p className="text-sm text-danger">{error}</p> : null}

        <Button
          full
          size="lg"
          onClick={() => void handleSave()}
          loading={saving}
          disabled={!photoUrl}
        >
          Save changes
        </Button>

        <Button
          full
          size="lg"
          variant="secondary"
          onClick={() => void handleToggleActive()}
          disabled={saving}
        >
          {space.active ? 'Pause listing' : 'Activate listing'}
        </Button>

        {confirmDelete ? (
          <Card className="space-y-3">
            <p className="text-sm font-semibold">Delete this listing?</p>
            <p className="text-xs text-ink-muted">
              This cannot be undone. Listings with bookings cannot be deleted —
              pause them instead.
            </p>
            <div className="flex gap-2">
              <Button
                full
                size="md"
                variant="danger"
                loading={deleting}
                onClick={() => void handleDelete()}
              >
                Delete
              </Button>
              <Button
                full
                size="md"
                variant="secondary"
                onClick={() => setConfirmDelete(false)}
              >
                Cancel
              </Button>
            </div>
          </Card>
        ) : (
          <Button
            full
            size="lg"
            variant="ghost"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="mr-2 size-4" />
            Delete listing
          </Button>
        )}
      </div>
    </HostShell>
  )
}
