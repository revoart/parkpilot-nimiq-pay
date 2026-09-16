import {
  ArrowUpRight,
  Check,
  ChevronRight,
  Copy,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
} from 'lucide-react'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'

import { NimiqMark } from '@/components/brand/NimiqMark'
import { UsdtMark } from '@/components/brand/UsdtMark'
import { AppShell } from '@/components/layout/AppShell'
import { ListingPhoto } from '@/components/parking/ListingPhoto'
import { Avatar } from '@/components/profile/Avatar'
import { EditProfileSheet } from '@/components/profile/EditProfileSheet'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'
import { StatusPill } from '@/components/ui/StatusPill'
import { ChainBadge } from '@/components/wallet/ChainBadge'
import { NimiqIdentityCard } from '@/components/wallet/NimiqIdentityCard'
import { useAppMode, type AppMode } from '@/hooks/useAppMode'
import { useProfile } from '@/hooks/useProfile'
import { useWallet } from '@/hooks/useWallet'
import {
  getHostWallet,
  listHostSpaces,
  type HostSpace,
  type HostWallet,
} from '@/lib/host'
import {
  listReservations,
  type ReservationSummary,
} from '@/lib/reservations'
import { cn } from '@/utils/cn'
import { formatUsdt, shortenAddress } from '@/utils/format'
import { formatPhone, telHref } from '@/utils/phone'

interface Row {
  label: string
  to: string
}

const ROWS: Row[] = [
  { label: 'Messages', to: '/messages' },
  { label: 'Settings', to: '/settings' },
  { label: 'Privacy Policy', to: '/privacy' },
  { label: 'Help & Support', to: '/privacy' },
]

const MODES: { value: AppMode; label: string }[] = [
  { value: 'driver', label: 'Driver Mode' },
  { value: 'host', label: 'Host Mode' },
]

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="text-[10px] font-extrabold uppercase tracking-[1.2px] text-ink-faint dark:text-ink-muted">
      {children}
    </p>
  )
}

function SettingsRows({ rows }: { rows: Row[] }) {
  const navigate = useNavigate()
  return (
    <div className="space-y-2">
      {rows.map(({ label, to }) => (
        <Card key={label} className="p-0">
          <button
            type="button"
            onClick={() => navigate(to)}
            className="flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-2.5 text-left active:opacity-90"
          >
            <span className="text-[17px] font-bold tracking-[-0.2px]">
              {label}
            </span>
            <ChevronRight className="size-5 shrink-0 text-ink-faint" />
          </button>
        </Card>
      ))}
    </div>
  )
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

/** "Today, 10:00 AM" / "Yesterday, 6:30 PM" / "Sep 12, 8:00 AM". */
function activityLabel(iso: string): string {
  const date = new Date(iso)
  const time = date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
  const days = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86_400_000)
  if (days === 0) return `Today, ${time}`
  if (days === 1) return `Yesterday, ${time}`
  return `${date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })}, ${time}`
}

export function ProfileScreen() {
  const navigate = useNavigate()
  const wallet = useWallet()
  const { mode, setMode } = useAppMode()
  const { profile } = useProfile()

  const [editOpen, setEditOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const tel = telHref(profile?.phone)

  const [bookings, setBookings] = useState<ReservationSummary[]>([])
  const [hostWallet, setHostWallet] = useState<HostWallet | null>(null)
  const [hostSpaces, setHostSpaces] = useState<HostSpace[]>([])
  const [dataLoading, setDataLoading] = useState(false)

  useEffect(() => {
    if (!wallet.address || mode !== 'driver') return
    let active = true
    setDataLoading(true)
    listReservations(wallet.address)
      .then((rows) => {
        if (active) setBookings(rows)
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setDataLoading(false)
      })
    return () => {
      active = false
    }
  }, [wallet.address, mode])

  useEffect(() => {
    if (!wallet.address || mode !== 'host') return
    let active = true
    setDataLoading(true)
    void Promise.all([
      getHostWallet(wallet.address).catch(() => null),
      listHostSpaces(wallet.address).catch(() => []),
    ]).then(([walletData, spaces]) => {
      if (!active) return
      setHostWallet(walletData)
      setHostSpaces(spaces)
      setDataLoading(false)
    })
    return () => {
      active = false
    }
  }, [wallet.address, mode])

  const copyAddress = useCallback(async () => {
    if (!wallet.address) return
    try {
      await navigator.clipboard.writeText(wallet.address)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard unavailable (e.g. insecure context) — non-critical
    }
  }, [wallet.address])

  const displayName =
    profile?.display_name?.trim() ||
    (wallet.address ? shortenAddress(wallet.address, 4) : 'Your account')

  const recent = [...bookings]
    .sort(
      (a, b) =>
        new Date(b.reservation.start_at).getTime() -
        new Date(a.reservation.start_at).getTime(),
    )
    .slice(0, 3)

  return (
    <AppShell showBack showNav title="Profile">
      <div className="space-y-3">
        {/* Identity */}
        <Card className="relative space-y-3 p-4">
          <button
            type="button"
            aria-label="Edit profile"
            onClick={() => setEditOpen(true)}
            className="absolute right-3 top-3 flex size-8 items-center justify-center rounded-full bg-surface text-ink-soft active:opacity-90"
          >
            <Pencil className="size-3.5" />
          </button>

          <div className="flex items-center gap-3.5">
            {profile?.avatar_url ? (
              <Avatar
                url={profile.avatar_url}
                name={profile.display_name}
                address={wallet.address}
                className="size-14 shrink-0 rounded-full"
              />
            ) : (
              <NimiqMark className="size-14 shrink-0" />
            )}
            <div className="min-w-0 flex-1 pr-8">
              <p className="truncate text-[20px] font-extrabold tracking-[-0.3px]">
                {displayName}
              </p>
              {profile?.bio ? (
                <p className="mt-0.5 line-clamp-2 text-[13px] leading-[18px] text-ink-muted">
                  {profile.bio}
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void copyAddress()}
              disabled={!wallet.address}
              aria-label={
                wallet.address ? 'Copy wallet address' : 'Wallet not connected'
              }
              className="inline-flex items-center gap-1.5 rounded-lg bg-surface px-2.5 py-1.5 text-[13px] font-semibold text-ink active:opacity-90 disabled:opacity-60"
            >
              {wallet.address ? shortenAddress(wallet.address, 5) : 'Not connected'}
              {copied ? (
                <Check className="size-3 text-success" />
              ) : (
                <Copy className="size-3 text-brand" />
              )}
            </button>

            {/* Dial straight from the profile — the number is the user's own. */}
            {tel ? (
              <a
                href={tel}
                aria-label={`Call ${formatPhone(profile?.phone) ?? 'your number'}`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-surface px-2.5 py-1.5 text-[13px] font-semibold text-brand active:opacity-90"
              >
                <Phone className="size-3" />
                {formatPhone(profile?.phone)}
              </a>
            ) : (
              <button
                type="button"
                onClick={() => setEditOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-surface px-2.5 py-1.5 text-[13px] font-semibold text-ink-muted active:opacity-90"
              >
                <Phone className="size-3" />
                Add phone
              </button>
            )}
          </div>
        </Card>

        {/* Driver / Host */}
        <div className="flex gap-1 rounded-full bg-surface p-1">
          {MODES.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              onClick={() => setMode(value)}
              className={cn(
                'flex-1 rounded-full py-2.5 text-[14px] font-bold transition-colors',
                mode === value
                  ? 'bg-surface-raised text-ink'
                  : 'text-ink-muted',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === 'driver' ? (
          <>
            {wallet.address ? (
              <Card className="space-y-3.5 p-4">
                <div className="flex items-center justify-between">
                  <Eyebrow>Wallet balance</Eyebrow>
                  <ChainBadge />
                </div>

                <div className="flex items-baseline gap-2">
                  <UsdtMark className="size-8 shrink-0 self-center" />
                  <span className="text-[34px] font-extrabold leading-none tracking-[-1px]">
                    {wallet.usdtBalance === null
                      ? '—'
                      : formatUsdt(wallet.usdtBalance)}
                  </span>
                  <span className="text-[20px] font-extrabold leading-none text-brand">
                    USDT
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => void wallet.refreshBalances()}
                    className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-brand active:opacity-90"
                  >
                    <RefreshCw className="size-4" />
                    Refresh Balance
                  </button>
                  <button
                    type="button"
                    onClick={wallet.disconnect}
                    className="text-[14px] font-semibold text-danger underline active:opacity-90"
                  >
                    Disconnect
                  </button>
                </div>
              </Card>
            ) : (
              <Card className="space-y-3.5 p-4">
                <div className="flex items-center justify-between">
                  <Eyebrow>Wallet balance</Eyebrow>
                  <ChainBadge />
                </div>
                <p className="text-[14px] leading-5 text-ink-muted">
                  Connect your wallet to see your USDT balance and pay for
                  parking.
                </p>
                <Button
                  full
                  size="lg"
                  onClick={() => void wallet.connect()}
                  loading={wallet.status === 'connecting'}
                >
                  Connect Wallet
                </Button>
              </Card>
            )}

            {recent.length > 0 ? (
              <div className="space-y-2">
                <div className="px-1">
                  <Eyebrow>Recent activity</Eyebrow>
                </div>
                <div className="space-y-2">
                  {recent.map((item) => (
                    <Card key={item.reservation.id} className="p-0">
                      <button
                        type="button"
                        onClick={() => navigate(`/pass/${item.reservation.id}`)}
                        className="flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left active:opacity-90"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-[17px] font-bold tracking-[-0.2px]">
                            {item.parkingSpace.title}
                          </span>
                          <span className="mt-0.5 block text-[13px] text-ink-muted">
                            {activityLabel(item.reservation.start_at)}
                          </span>
                        </span>
                        <span className="shrink-0 text-[15px] font-bold text-brand">
                          {formatUsdt(item.reservation.amount_usdt)} USDT
                        </span>
                      </button>
                    </Card>
                  ))}
                </div>
              </div>
            ) : null}

            <SettingsRows rows={ROWS} />
            <NimiqIdentityCard />
          </>
        ) : (
          <>
            <Card className="space-y-3.5 p-4">
              <div className="flex items-center justify-between">
                <Eyebrow>Host wallet</Eyebrow>
                <StatusPill tone="accent">Merchant</StatusPill>
              </div>

              <div className="flex items-baseline gap-2">
                <UsdtMark className="size-8 shrink-0 self-center" />
                <span className="text-[34px] font-extrabold leading-none tracking-[-1px]">
                  {hostWallet ? formatUsdt(hostWallet.available) : '—'}
                </span>
                <span className="text-[20px] font-extrabold leading-none text-brand">
                  USDT
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-surface p-3">
                  <p className="text-[11px] text-ink-muted">Pending</p>
                  <p className="mt-0.5 text-[17px] font-bold leading-none">
                    {hostWallet ? formatUsdt(hostWallet.pending) : '—'}
                  </p>
                </div>
                <div className="rounded-xl bg-surface p-3">
                  <p className="text-[11px] text-ink-muted">Total earned</p>
                  <p className="mt-0.5 text-[17px] font-bold leading-none">
                    {hostWallet ? formatUsdt(hostWallet.totalEarned) : '—'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => navigate('/host/earnings')}
                >
                  <ArrowUpRight className="size-4" />
                  Withdraw
                </Button>
                <Button
                  variant="ghost"
                  size="md"
                  onClick={() => navigate('/host')}
                >
                  Dashboard
                </Button>
              </div>
            </Card>

            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <Eyebrow>Your listings</Eyebrow>
                <button
                  type="button"
                  onClick={() => navigate('/host/add')}
                  className="flex items-center gap-1 text-[12px] font-semibold text-ink-muted"
                >
                  <Plus className="size-3.5" />
                  Add
                </button>
              </div>

              {dataLoading ? (
                <Skeleton className="h-16 w-full rounded-2xl" />
              ) : hostSpaces.length > 0 ? (
                <div className="space-y-2">
                  {hostSpaces.slice(0, 3).map((space) => (
                    <Card key={space.id} className="p-0">
                      <button
                        type="button"
                        onClick={() => navigate(`/host/space/${space.id}`)}
                        className="flex w-full items-center gap-3 rounded-2xl p-3 text-left active:opacity-90"
                      >
                        <ListingPhoto
                          imageUrl={space.image_url}
                          title={space.title}
                          className="size-12 shrink-0 rounded-xl"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-semibold">
                            {space.title}
                          </span>
                          <span className="block truncate text-[13px] text-ink-muted">
                            {formatUsdt(space.price_usdt)} USDT / hr
                          </span>
                        </span>
                        <StatusPill tone={space.active ? 'success' : 'neutral'}>
                          {space.active ? 'Live' : 'Paused'}
                        </StatusPill>
                      </button>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card className="text-center">
                  <p className="text-sm font-semibold">No parking spaces yet</p>
                  <p className="mt-1 text-xs text-ink-muted">
                    Add your first parking space to start earning.
                  </p>
                  <div className="mt-3">
                    <Button size="md" onClick={() => navigate('/host/add')}>
                      Add Parking
                    </Button>
                  </div>
                </Card>
              )}
            </div>

            <SettingsRows rows={ROWS} />
          </>
        )}
      </div>

      <EditProfileSheet open={editOpen} onClose={() => setEditOpen(false)} />
    </AppShell>
  )
}
