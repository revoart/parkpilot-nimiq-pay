import { ImagePlus } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { AvailabilityPicker } from '@/components/host/AvailabilityPicker'
import { HostShell } from '@/components/layout/HostShell'
import { LocationMap } from '@/components/map/LocationMap'
import { ListingPhoto } from '@/components/parking/ListingPhoto'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { Toggle } from '@/components/ui/Toggle'
import { useAddressSuggestions } from '@/hooks/useAddressSuggestions'
import { useWallet } from '@/hooks/useWallet'
import {
  createParkingSpace,
  setAvailability,
  uploadParkingPhoto,
} from '@/lib/host'
import {
  dayRulesToInput,
  defaultDayRules,
  describeDayRules,
  type DayRule,
} from '@/lib/parking'
import { cn } from '@/utils/cn'
import { hapticConfirm } from '@/utils/haptics'

const TOTAL = 7
const PHOTO_STEP = 6
const REVIEW_STEP = 7
const TITLES = [
  'Where is your space?',
  'What type of space?',
  'Set your price',
  'Listing details',
  'When can drivers book?',
  'Parking photo',
  'Review listing',
]

const TYPES = [
  { value: 'garage', label: 'Garage' },
  { value: 'underground', label: 'Underground' },
  { value: 'lot', label: 'Parking lot' },
  { value: 'street', label: 'Street' },
]

export function HostAddScreen() {
  const navigate = useNavigate()
  const wallet = useWallet()
  const toast = useToast()

  const [step, setStep] = useState(1)
  const [address, setAddress] = useState('')
  // Deliberately blank: a listing must be placed at a real address, never at a
  // default coordinate that the host did not choose.
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const [parkingType, setParkingType] = useState('garage')
  const [price, setPrice] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [covered, setCovered] = useState(true)
  const [evCharging, setEvCharging] = useState(false)
  const [accessible, setAccessible] = useState(false)
  const [days, setDays] = useState<DayRule[]>(defaultDayRules)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [suppressSuggestions, setSuppressSuggestions] = useState(false)
  const { suggestions } = useAddressSuggestions(address)

  // Exactly one mandatory photo. It is uploaded as soon as it is chosen so the
  // host sees validation immediately, and publish can never run without it.
  const fileInput = useRef<HTMLInputElement | null>(null)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [photoUploading, setPhotoUploading] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)

  async function handlePhoto(file: File | null) {
    if (!file) return
    setPhotoError(null)
    setPhotoPreview(URL.createObjectURL(file))

    if (!wallet.address) {
      setPhotoError('Connect your wallet to add a photo.')
      return
    }

    setPhotoUploading(true)
    try {
      setPhotoUrl(await uploadParkingPhoto(wallet.address, file))
    } catch (err) {
      setPhotoUrl(null)
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
    if (fileInput.current) fileInput.current.value = ''
  }

  const lat = Number(latitude)
  const lng = Number(longitude)
  const coordsValid =
    latitude.trim() !== '' &&
    longitude.trim() !== '' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180 &&
    // (0, 0) is in the Atlantic — it means the fields were never filled in.
    !(lat === 0 && lng === 0)
  const priceValue = Number(price)

  const hoursSummary = useMemo(() => describeDayRules(days), [days])

  function stepValid(): boolean {
    if (step === 1) return address.trim().length >= 5 && coordsValid
    if (step === 2) return Boolean(parkingType)
    if (step === 3) return Number.isFinite(priceValue) && priceValue > 0
    if (step === 4) return title.trim().length >= 3
    if (step === PHOTO_STEP) return Boolean(photoUrl)
    return true
  }

  async function handlePrimary() {
    setError(null)
    if (step < TOTAL) {
      if (step === PHOTO_STEP && !photoUrl) {
        setError('Add a photo of your parking space to continue.')
        return
      }
      if (!stepValid()) {
        setError('Please complete this step before continuing.')
        return
      }
      setStep(step + 1)
      return
    }

    if (!wallet.address) {
      setError('Connect your wallet to publish.')
      return
    }
    if (!photoUrl) {
      setError('Add a photo of your parking space to continue.')
      return
    }

    const { rules, error: ruleError } = dayRulesToInput(days)
    if (ruleError) {
      setError(ruleError)
      setStep(5)
      return
    }

    setSubmitting(true)
    try {
      const space = await createParkingSpace({
        evmAddress: wallet.address,
        title: title.trim(),
        address: address.trim(),
        latitude: lat,
        longitude: lng,
        priceUsdt: priceValue,
        parkingType,
        description: description.trim() || undefined,
        covered,
        evCharging,
        accessible,
        imageUrl: photoUrl,
      })

      // Rules attach to a listing id, so they can only be saved once it exists.
      if (rules.length > 0) {
        try {
          await setAvailability(wallet.address, space.id, rules)
        } catch {
          toast.show('Published, but your hours could not be saved.', 'error')
        }
      }

      toast.show('Listing published.', 'success')
      hapticConfirm()
      navigate('/host')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not publish.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <HostShell showBack showNav={false} title={TITLES[step - 1]}>
      <div className="space-y-3.5">
        {/* Progress */}
        <div className="flex items-center gap-2">
          <div className="flex flex-1 gap-1">
            {Array.from({ length: TOTAL }).map((_, index) => (
              <div
                key={index}
                className={cn(
                  'h-1 flex-1 rounded-full transition-all',
                  index < step ? 'bg-ink' : 'bg-line',
                )}
              />
            ))}
          </div>
          <span className="text-xs font-semibold text-ink-faint">
            {step}/{TOTAL}
          </span>
        </div>

        {step === 1 ? (
          <div className="space-y-3">
            {coordsValid ? (
              <LocationMap
                point={{ lat, lng }}
                className="h-40 w-full overflow-hidden rounded-2xl border border-line"
              />
            ) : (
              <div className="flex h-40 w-full items-center justify-center rounded-2xl border border-dashed border-line-strong bg-surface-raised px-6 text-center">
                <p className="text-xs font-medium text-ink-muted">
                  Pick an address below to place your space on the map.
                </p>
              </div>
            )}
            <input
              value={address}
              onChange={(event) => {
                setAddress(event.target.value)
                setSuppressSuggestions(false)
              }}
              placeholder="Search an address (e.g. 42 Maple Ave, Toronto)"
              aria-label="Search an address"
              className="w-full rounded-xl bg-surface px-4 py-3.5 text-[15px] outline-none placeholder:text-ink-faint"
            />
            {!suppressSuggestions && suggestions.length > 0 ? (
              <div className="overflow-hidden rounded-2xl bg-surface-raised">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion.id}
                    type="button"
                    onClick={() => {
                      setAddress(suggestion.address)
                      setLatitude(String(suggestion.lat))
                      setLongitude(String(suggestion.lng))
                      setSuppressSuggestions(true)
                    }}
                    className="block w-full px-4 py-3 text-left active:opacity-70"
                  >
                    <span className="block truncate text-[14px] font-semibold">
                      {suggestion.name}
                    </span>
                    <span className="block truncate text-xs text-ink-muted">
                      {suggestion.address}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              <input
                value={latitude}
                onChange={(event) => setLatitude(event.target.value)}
                placeholder="Latitude"
                inputMode="decimal"
                aria-label="Latitude"
                className="w-full rounded-xl bg-surface px-4 py-3 text-sm outline-none placeholder:text-ink-faint"
              />
              <input
                value={longitude}
                onChange={(event) => setLongitude(event.target.value)}
                placeholder="Longitude"
                inputMode="decimal"
                aria-label="Longitude"
                className="w-full rounded-xl bg-surface px-4 py-3 text-sm outline-none placeholder:text-ink-faint"
              />
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="grid grid-cols-2 gap-2">
            {TYPES.map((type) => (
              <button
                key={type.value}
                type="button"
                onClick={() => setParkingType(type.value)}
                className={cn(
                  'rounded-2xl border py-4 text-[15px] font-semibold transition',
                  parkingType === type.value
                    ? 'border-ink bg-ink text-on-ink'
                    : 'border-line bg-surface-raised text-ink',
                )}
              >
                {type.label}
              </button>
            ))}
          </div>
        ) : null}

        {step === 3 ? (
          <div className="flex items-center gap-3 rounded-2xl bg-surface-raised px-4 py-3">
            <span className="flex-1 text-[15px] font-semibold">
              Hourly rate
            </span>
            <span className="text-ink-muted">USDT</span>
            <input
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              placeholder="5.00"
              inputMode="decimal"
              aria-label="Hourly rate in USDT"
              className="w-24 rounded-xl border border-line bg-surface px-3 py-2 text-right text-[15px] font-bold outline-none"
            />
          </div>
        ) : null}

        {step === 4 ? (
          <div className="space-y-3">
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Listing name (e.g. Private Driveway)"
              aria-label="Listing name"
              className="w-full rounded-xl bg-surface px-4 py-3.5 text-[15px] outline-none placeholder:text-ink-faint"
            />
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Describe your space (optional)"
              aria-label="Description"
              rows={3}
              className="w-full resize-none rounded-xl bg-surface px-4 py-3 text-sm outline-none placeholder:text-ink-faint"
            />
            <div className="overflow-hidden rounded-2xl bg-surface-raised">
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
            </div>
          </div>
        ) : null}

        {step === 5 ? (
          <div className="space-y-3">
            <p className="text-[13px] leading-relaxed text-ink-muted">
              Choose the hours drivers can book. Leave every day off to accept
              bookings at any time.
            </p>
            <AvailabilityPicker days={days} onChange={setDays} />
          </div>
        ) : null}

        {step === PHOTO_STEP ? (
          <div className="space-y-3">
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

            {photoPreview || photoUrl ? (
              <div className="space-y-3">
                <div className="relative overflow-hidden rounded-2xl">
                  <img
                    src={photoUrl ?? photoPreview ?? ''}
                    alt="Parking space preview"
                    className="h-40 w-full bg-map object-cover"
                  />
                  {photoUploading ? (
                    <span className="absolute inset-x-0 bottom-0 bg-ink/75 py-2 text-center text-[11px] font-semibold text-on-ink">
                      Uploading…
                    </span>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <p className="flex-1 text-[13px] font-semibold text-success">
                    Photo added ✓
                  </p>
                  <button
                    type="button"
                    onClick={() => fileInput.current?.click()}
                    className="rounded-xl border border-line-strong px-3.5 py-2 text-[13px] font-semibold"
                  >
                    Replace Photo
                  </button>
                  <button
                    type="button"
                    onClick={clearPhoto}
                    className="rounded-xl px-3 py-2 text-[13px] font-semibold text-ink-muted"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="flex w-full flex-col items-center gap-3 rounded-2xl border border-dashed border-line-strong bg-surface-raised px-4 py-10 active:opacity-90"
              >
                <span className="flex size-12 items-center justify-center rounded-2xl bg-surface">
                  <ImagePlus className="size-5 text-ink-soft" />
                </span>
                <span className="text-[15px] font-bold">Add Photo</span>
                <span className="max-w-[250px] text-center text-xs leading-relaxed text-ink-muted">
                  Add one clear photo so drivers can recognize your parking
                  space.
                </span>
              </button>
            )}

            {photoError ? (
              <p className="text-sm text-danger">{photoError}</p>
            ) : null}
          </div>
        ) : null}

        {step === REVIEW_STEP ? (
          <div className="space-y-3">
            <ListingPhoto
              imageUrl={photoUrl}
              title={title || 'Parking space'}
              className="h-32 w-full rounded-2xl"
            />
            <div className="space-y-3 rounded-2xl bg-surface-raised p-4">
            {[
              { label: 'Name', value: title || '—' },
              { label: 'Address', value: address || '—' },
              {
                label: 'Type',
                value: TYPES.find((type) => type.value === parkingType)?.label ?? '—',
              },
              { label: 'Hourly rate', value: `${price || '0'} USDT` },
              { label: 'Hours', value: hoursSummary },
              {
                label: 'Amenities',
                value:
                  [
                    covered ? 'Covered' : null,
                    evCharging ? 'EV' : null,
                    accessible ? 'Accessible' : null,
                  ]
                    .filter(Boolean)
                    .join(', ') || 'None',
              },
            ].map((row) => (
              <div key={row.label} className="flex justify-between gap-4">
                <span className="text-[14px] text-ink-muted">{row.label}</span>
                <span className="text-right text-[14px] font-semibold">
                  {row.value}
                </span>
              </div>
            ))}
            </div>
          </div>
        ) : null}

        {error ? <p className="text-sm text-danger">{error}</p> : null}

        <Button
          full
          size="lg"
          onClick={() => void handlePrimary()}
          loading={submitting}
          disabled={step === PHOTO_STEP && !photoUrl}
        >
          {step < TOTAL ? 'Continue' : 'Publish parking space'}
        </Button>
      </div>
    </HostShell>
  )
}
