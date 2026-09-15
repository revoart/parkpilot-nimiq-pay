import { ChevronRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { AppShell } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/Button'
import { Toggle } from '@/components/ui/Toggle'
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
    <AppShell showBack title="Settings">
      <div className="space-y-3">
        <div className="overflow-hidden rounded-2xl bg-surface-raised">
          {(
            [
              ['push', 'Push notifications'],
              ['location', 'Location services'],
              ['biometric', 'Biometric unlock'],
            ] as [keyof Prefs, string][]
          ).map(([key, label], index, arr) => (
            <div key={key}>
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-[15px] font-medium">{label}</span>
                <Toggle
                  on={prefs[key]}
                  ariaLabel={label}
                  onChange={() => update(key)}
                />
              </div>
              {index < arr.length - 1 ? (
                <div className="mx-4 h-px bg-line" />
              ) : null}
            </div>
          ))}
          <div className="mx-4 h-px bg-line" />
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-[15px] font-medium">Dark mode</span>
            <Toggle
              on={theme === 'dark'}
              ariaLabel="Dark mode"
              onChange={toggle}
            />
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl bg-surface-raised">
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-[15px] font-medium">Wallet</span>
            <span className="font-mono text-[13px] text-ink-muted">
              {wallet.address ? shortenAddress(wallet.address, 5) : 'Not connected'}
            </span>
          </div>
          <div className="mx-4 h-px bg-line" />
          <button
            type="button"
            onClick={() => navigate('/privacy')}
            className="flex w-full items-center justify-between px-4 py-3"
          >
            <span className="text-[15px] font-medium">Privacy policy</span>
            <ChevronRight className="size-4 text-ink-faint" />
          </button>
        </div>

        <div className="flex items-center justify-between rounded-2xl bg-surface-raised px-4 py-3">
          <span className="text-[15px] font-medium">App version</span>
          <span className="text-[14px] text-ink-faint">0.1.0</span>
        </div>

        {wallet.address ? (
          <Button
            variant="secondary"
            full
            size="lg"
            onClick={() => {
              wallet.disconnect()
              navigate('/')
            }}
          >
            Disconnect wallet
          </Button>
        ) : null}
      </div>
    </AppShell>
  )
}
