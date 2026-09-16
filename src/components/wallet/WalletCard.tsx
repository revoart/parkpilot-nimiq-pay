import { LogOut, RefreshCw, Wallet } from 'lucide-react'

import { NimiqMark } from '@/components/brand/NimiqMark'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { StatusPill } from '@/components/ui/StatusPill'
import { UsdEquivalent } from '@/components/ui/UsdEquivalent'
import { useNimBalance } from '@/hooks/useNimBalance'
import { useWallet, type WalletStatus } from '@/hooks/useWallet'
import { lunaToNim } from '@/lib/nimiq'
import { formatNim, shortenAddress } from '@/utils/format'

const statusLabel: Record<WalletStatus, string> = {
  unavailable: 'Wallet unavailable',
  disconnected: 'Not connected',
  connecting: 'Connecting…',
  connected: 'Connected',
  error: 'Error',
}

const statusTone: Record<
  WalletStatus,
  'neutral' | 'success' | 'warning' | 'danger' | 'accent'
> = {
  unavailable: 'neutral',
  disconnected: 'neutral',
  connecting: 'accent',
  connected: 'success',
  error: 'danger',
}

export function WalletCard() {
  const wallet = useWallet()
  const { balanceLuna, loading, refresh } = useNimBalance(wallet.address)

  const nim = balanceLuna === null ? null : lunaToNim(balanceLuna)

  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <Wallet className="size-[18px]" />
          </span>
          <div>
            <p className="text-[14px] font-semibold">Wallet</p>
            <p className="text-[11px] text-ink-muted">NIM on Nimiq</p>
          </div>
        </div>
        <StatusPill tone={statusTone[wallet.status]}>
          {statusLabel[wallet.status]}
        </StatusPill>
      </div>

      {!wallet.providerAvailable ? (
        <p className="rounded-xl bg-surface p-3 text-[13px] text-ink-soft">
          Open ParkPilot inside Nimiq Pay to connect your account.
        </p>
      ) : wallet.address ? (
        <div className="space-y-2.5">
          <div className="rounded-xl bg-surface p-3">
            <p className="text-[11px] text-ink-muted">Nimiq address</p>
            <p className="font-mono text-[13px]">
              {shortenAddress(wallet.address, 6)}
            </p>
          </div>
          <div className="rounded-xl bg-surface p-3">
            <div className="flex items-center gap-1.5">
              <NimiqMark className="size-4" />
              <p className="text-[11px] text-ink-muted">Balance</p>
            </div>
            <p className="text-[17px] font-semibold">
              {nim === null ? '—' : `${formatNim(nim)} NIM`}
            </p>
            <UsdEquivalent nim={nim} className="text-[12px] text-ink-muted" />
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="md"
              onClick={() => void refresh()}
              loading={loading}
            >
              <RefreshCw className="size-4" />
              Refresh
            </Button>
            <Button variant="ghost" size="md" onClick={wallet.disconnect}>
              <LogOut className="size-4" />
              Disconnect
            </Button>
          </div>
        </div>
      ) : (
        <Button
          onClick={() => void wallet.connect()}
          loading={wallet.status === 'connecting'}
        >
          Connect Account
        </Button>
      )}

      {wallet.error ? (
        <p className="text-[13px] text-danger">{wallet.error}</p>
      ) : null}
    </Card>
  )
}
