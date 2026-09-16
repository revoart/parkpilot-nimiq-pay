import {
  Bell,
  ChevronRight,
  Fingerprint,
  MapPin,
  Moon,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'

import { AppShell } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Toggle } from '@/components/ui/Toggle'
import { ChainBadge } from '@/components/wallet/ChainBadge'
import { useTheme } from '@/hooks/useTheme'
import { useWallet } from '@/hooks/useWallet'
import { shortenAddress } from '@/utils/format'

type Prefs = {
  push: boolean
  location: boolean
  biometric: boolean
}

const KEY = 'parkpilot.settings'

const DEFAULTS: Prefs = {
  push: true,
  location: true,
  biometric: false,
}

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Prefs>) } : DEFAULTS
  } catch {
    return DEFAULTS
  }
}

const TOGGLES: { key: keyof Prefs; label: string; icon: LucideIcon }[] = [
  { key: 'push', label: 'Push Notifications', icon: Bell },
  { key: 'location', label: 'Location Services', icon: MapPin },
  { key: 'biometric', label: 'Biometric Lock', icon: Fingerprint },
]

function Row({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon
  label: string
  children: ReactNode
}) {
  return (
    <Card className="flex items-center gap-3 p-4">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface text-brand">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span className="flex-1 text-[15px] font-semibold">{label}</span>
      {children}
    </Card>
  )
}

export function SettingsScreen() {
  const navigate = useNavigate()
  const wallet = useWallet()
  const { theme, toggle } = useTheme()
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS)

  useEffect(() => {
    setPrefs(loadPrefs())
  }, [])

  function update(key: keyof Prefs) {
    setPrefs((previous) => {
      const next = { ...previous, [key]: !previous[key] }
      try {
        localStorage.setItem(KEY, JSON.stringify(next))
      } catch {
        // ignore
      }
      return next
    })
  }

  return (
    <AppShell showBack title="Settings" showWallet={false}>
      <div className="space-y-3">
        {TOGGLES.map(({ key, label, icon }) => (
          <Row key={key} icon={icon} label={label}>
            <Toggle
              on={prefs[key]}
              ariaLabel={label}
              onChange={() => update(key)}
            />
          </Row>
        ))}

        <Row icon={Moon} label="Dark Mode">
          <Toggle
            on={theme === 'dark'}
            ariaLabel="Dark mode"
            onChange={toggle}
          />
        </Row>

        <div className="space-y-2 pt-2">
          <p className="px-1 text-[11px] font-bold uppercase leading-[13px] tracking-[0.4px] text-ink-faint dark:text-ink-muted">
            {wallet.address ? 'Connected wallet' : 'Wallet'}
          </p>
          <Card className="flex items-center justify-between gap-3 p-4">
            {wallet.address ? (
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className="size-2.5 shrink-0 rounded-full bg-success"
                  aria-hidden="true"
                />
                <span className="truncate text-[15px] font-semibold">
                  {shortenAddress(wallet.address, 5)}
                </span>
              </span>
            ) : (
              <span className="text-[15px] text-ink-muted">Not connected</span>
            )}
            {wallet.address ? <ChainBadge /> : null}
          </Card>

          <Card className="p-0">
            <button
              type="button"
              onClick={() => navigate('/privacy')}
              className="flex w-full items-center justify-between gap-3 rounded-2xl p-4 text-left"
            >
              <span className="text-[15px] font-semibold">
                Privacy Policy &amp; Agreement
              </span>
              <ChevronRight
                className="size-5 shrink-0 text-ink-faint"
                aria-hidden="true"
              />
            </button>
          </Card>
        </div>

        <p className="pt-1 text-center text-[13px] leading-[18px] text-ink-muted">
          ParkPilot v0.1.0 • Mini-App Interface
        </p>

        {wallet.address ? (
          <Button
            variant="danger"
            full
            size="lg"
            className="border border-danger"
            onClick={() => {
              wallet.disconnect()
              navigate('/')
            }}
          >
            Disconnect Wallet
          </Button>
        ) : null}
      </div>
    </AppShell>
  )
}
