import {
  ArrowUpRight,
  Bell,
  Bookmark,
  Car,
  Check,
  ChevronRight,
  Copy,
  HelpCircle,
  Pencil,
  Plus,
  RefreshCw,
  Settings as SettingsIcon,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react'
import { useCallback, useEffect, useState, type ComponentType } from 'react'
import { useNavigate } from 'react-router-dom'

import { AppShell } from '@/components/layout/AppShell'
import { ListingPhoto } from '@/components/parking/ListingPhoto'
import { Avatar } from '@/components/profile/Avatar'
import { EditProfileSheet } from '@/components/profile/EditProfileSheet'
import { NimiqIdentityCard } from '@/components/wallet/NimiqIdentityCard'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'
import { StatusPill } from '@/components/ui/StatusPill'
import { useAppMode, type AppMode } from '@/hooks/useAppMode'
import { useProfile } from '@/hooks/useProfile'
import { useWallet } from '@/hooks/useWallet'
import { getHostWallet, listHostSpaces, type HostSpace, type HostWallet } from '@/lib/host'
import {
  listReservations,
  type ReservationSummary,
} from '@/lib/reservations'
import { cn } from '@/utils/cn'
import { formatUsdt, shortenAddress } from '@/utils/format'

interface Row {
  label: string
  icon: ComponentType<{ className?: string }>
  to: string
}

const ROWS: Row[] = [
  { label: 'Bookings', icon: Car, to: '/my-parking' },
  { label: 'Saved places', icon: Bookmark, to: '/saved' },
  { label: 'Notifications', icon: Bell, to: '/notifications' },
  { label: 'Privacy', icon: ShieldCheck, to: '/privacy' },
  { label: 'Settings', icon: SettingsIcon, to: '/settings' },
  { label: 'Help & support', icon: HelpCircle, to: '/privacy' },
]

const HOST_ROWS: Row[] = [
  { label: 'Host dashboard', icon: TrendingUp, to: '/host' },
  { label: 'Host bookings', icon: Car, to: '/host/bookings' },
  { label: 'Notifications', icon: Bell, to: '/notifications' },
  { label: 'Settings', icon: SettingsIcon, to: '/settings' },
  { label: 'Help & support', icon: HelpCircle, to: '/privacy' },
]

function Rows({ rows }: { rows: Row[] }) {
  const navigate = useNavigate()
  return (
    <div className="overflow-hidden rounded-2xl bg-surface-raised">
      {rows.map(({ label, icon: Icon, to }, index) => (
        <div key={label}>
          <button
            type="button"
            onClick={() => navigate(to)}
            className="flex w-full items-center gap-3 px-4 py-3 active:bg-subtle"
          >
            <span className="flex size-9 items-center justify-center rounded-xl bg-surface">
              <Icon className="size-4 text-ink-soft" />
            </span>
            <span className="flex-1 text-left text-[15px] font-medium">
              {label}
            </span>
            <ChevronRight className="size-4 text-ink-faint" />
          </button>
          {index < rows.length - 1 ? (
            <div className="ml-[56px] h-px bg-line" />
          ) : null}
        </div>
      ))}
    </div>
  )
}

export function ProfileScreen() {
  const navigate = useNavigate()
  const wallet = useWallet()
  const { mode, setMode } = useAppMode()
  const { profile } = useProfile()

  const [editOpen, setEditOpen] = useState(false)
  const [copied, setCopied] = useState(false)

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

  const now = Date.now()
  const upcoming = bookings
    .filter(
      (item) =>
        item.reservation.status === 'reservation_confirmed' &&
        new Date(item.reservation.end_at).getTime() > now,
    )
    .sort(
      (a, b) =>
        new Date(a.reservation.start_at).getTime() -
        new Date(b.reservation.start_at).getTime(),
    )

  return (
    <AppShell showNav>
      <div className="space-y-3">
        {/* Identity */}
        <div className="flex items-start gap-4">
          <Avatar
            url={profile?.avatar_url ?? null}
            name={profile?.display_name ?? null}
            address={wallet.address}
            className="size-[68px] shrink-0 rounded-[22px]"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p className="truncate text-[18px] font-bold tracking-[-0.3px]">
                {profile?.display_name || 'Your account'}
              </p>
              <button
                type="button"
                onClick={() => setEditOpen(true)}
                aria-label="Edit profile"
                className="-mr-1 flex size-8 shrink-0 items-center justify-center rounded-xl bg-surface-raised"
              >
                <Pencil className="size-3.5 text-ink-soft" />
              </button>
            </div>

            {profile?.bio ? (
              <p className="mt-0.5 line-clamp-2 text-[13px] text-ink-muted">
                {profile.bio}
              </p>
            ) : null}

            <button
              type="button"
              onClick={() => void copyAddress()}
              className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-surface-raised px-2.5 py-1"
            >
              <span className="size-1.5 rounded-full bg-success" />
              <span className="font-mono text-[11px] text-ink-soft">
                {wallet.address ? shortenAddress(wallet.address, 6) : 'Not connected'}
              </span>
              {copied ? (
                <Check className="size-3 text-success" />
              ) : (
                <Copy className="size-3 text-ink-faint" />
              )}
            </button>
          </div>
        </div>

        {/* Driver / Host */}
        <div className="flex gap-1 rounded-2xl bg-surface-raised p-1">
          {(['driver', 'host'] as AppMode[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              className={cn(
                'flex-1 rounded-xl py-2.5 text-[13px] font-bold capitalize transition-all',
                mode === value
                  ? 'bg-ink text-on-ink'
                  : 'text-ink-faint',
              )}
            >
              {value}
            </button>
          ))}
        </div>

        {mode === 'driver' ? (
          <>
            <Card className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Driver wallet</p>
                  <p className="text-xs text-ink-muted">
                    Spending wallet for parking
                  </p>
                </div>
                <StatusPill tone={wallet.onPolygon ? 'success' : 'neutral'}>
                  {wallet.address
                    ? wallet.onPolygon
                      ? 'Polygon'
                      : 'Wrong network'
                    : 'Not connected'}
                </StatusPill>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-surface p-3">
                  <p className="text-xs text-ink-muted">USDT</p>
                  <p className="mt-0.5 text-[19px] font-bold leading-none tracking-[-0.4px]">
                    {wallet.usdtBalance === null
                      ? '—'
                      : formatUsdt(wallet.usdtBalance)}
                  </p>
                </div>
                <div className="rounded-xl bg-surface p-3">
                  <p className="text-xs text-ink-muted">POL (gas)</p>
                  <p className="mt-0.5 text-[19px] font-bold leading-none tracking-[-0.4px]">
                    {wallet.polBalance === null
                      ? '—'
                      : Number(wallet.polBalance).toFixed(3)}
                  </p>
                </div>
              </div>

              {wallet.address ? (
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="md"
                    onClick={() => void wallet.refreshBalances()}
                  >
                    <RefreshCw className="size-4" />
                    Manage Wallet
                  </Button>
                  <Button
                    variant="ghost"
                    size="md"
                    onClick={() => navigate('/my-parking')}
                  >
                    View bookings
                  </Button>
                </div>
              ) : (
                <Button
                  full
                  size="lg"
                  onClick={() => void wallet.connect()}
                  loading={wallet.status === 'connecting'}
                >
                  Connect Wallet
                </Button>
              )}
            </Card>

            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <p className="text-[10px] font-bold uppercase tracking-[1.2px] text-ink-faint">
                  Your parking
                </p>
              {dataLoading ? (
                <Skeleton className="h-16 w-full rounded-2xl" />
              ) : upcoming.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => navigate('/my-parking')}
                    className="text-[12px] font-semibold text-ink-muted"
                  >
                    View all
                  </button>
                ) : null}
              </div>

              {upcoming.length > 0 ? (
                <div className="space-y-2">
                  {upcoming.slice(0, 2).map((item) => (
                    <button
                      key={item.reservation.id}
                      type="button"
                      onClick={() => navigate(`/pass/${item.reservation.id}`)}
                      className="flex w-full items-center gap-3 rounded-2xl bg-surface-raised p-3 text-left active:opacity-90"
                    >
                      <ListingPhoto
                        imageUrl={item.parkingSpace.image_url}
                        title={item.parkingSpace.title}
                        className="size-12 shrink-0 rounded-xl"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-semibold">
                          {item.parkingSpace.title}
                        </span>
                        <span className="block truncate text-xs text-ink-muted">
                          {new Date(
                            item.reservation.start_at,
                          ).toLocaleString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </span>
                      </span>
                      <ChevronRight className="size-4 shrink-0 text-ink-faint" />
                    </button>
                  ))}
                </div>
              ) : (
                <Card className="text-center">
                  <p className="text-sm font-semibold">No upcoming parking</p>
                  <p className="mt-1 text-xs text-ink-muted">
                    Find a space and it will show up here.
                  </p>
                  <div className="mt-3">
                    <Button size="md" onClick={() => navigate('/')}>
                      Find parking
                    </Button>
                  </div>
                </Card>
              )}
            </div>

            <NimiqIdentityCard />
            <Rows rows={ROWS} />
          </>
        ) : (
          <>
            <Card className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Host wallet</p>
                  <p className="text-xs text-ink-muted">Earnings and payouts</p>
                </div>
                <StatusPill tone="accent">Merchant</StatusPill>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl bg-surface p-3">
                  <p className="text-[11px] text-ink-muted">Available</p>
                  <p className="mt-0.5 text-[17px] font-bold leading-none">
                    {hostWallet ? formatUsdt(hostWallet.available) : '—'}
                  </p>
                </div>
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
                <p className="text-[10px] font-bold uppercase tracking-[1.2px] text-ink-faint">
                  Your listings
                </p>
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
                    <button
                      key={space.id}
                      type="button"
                      onClick={() => navigate(`/host/space/${space.id}`)}
                      className="flex w-full items-center gap-3 rounded-2xl bg-surface-raised p-3 text-left active:opacity-90"
                    >
                      <ListingPhoto
                        imageUrl={space.image_url}
                        title={space.title}
                        className="size-12 shrink-0 rounded-xl"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-semibold">
                          {space.title}
                        </span>
                        <span className="block truncate text-xs text-ink-muted">
                          {formatUsdt(space.price_usdt)} USDT / hr
                        </span>
                      </span>
                      <StatusPill tone={space.active ? 'success' : 'neutral'}>
                        {space.active ? 'Live' : 'Paused'}
                      </StatusPill>
                    </button>
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

            <Rows rows={HOST_ROWS} />
          </>
        )}
      </div>

      <EditProfileSheet open={editOpen} onClose={() => setEditOpen(false)} />
    </AppShell>
  )
}
