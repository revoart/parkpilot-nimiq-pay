import { LogOut, RefreshCw, Wallet } from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { StatusPill } from '@/components/ui/StatusPill'
import { useWallet, type WalletStatus } from '@/hooks/useWallet'
import { formatUsdt, shortenAddress } from '@/utils/format'

const statusLabel: Record<WalletStatus, string> = {
  unavailable: 'Wallet unavailable',
  disconnected: 'Not connected',
  connecting: 'Connecting…',
  connected: 'Connected',
  wrong_network: 'Wrong network',
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
  wrong_network: 'warning',
  error: 'danger',
}

export function WalletCard() {
  const wallet = useWallet()

  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <Wallet className="size-[18px]" />
          </span>
          <div>
            <p className="text-[14px] font-semibold">Wallet</p>
            <p className="text-[11px] text-ink-muted">USDT on Polygon</p>
          </div>
        </div>
        <StatusPill tone={statusTone[wallet.status]}>
          {statusLabel[wallet.status]}
        </StatusPill>
      </div>

      {!wallet.providerAvailable ? (
        <p className="rounded-xl bg-surface p-3 text-[13px] text-ink-soft">
          Open ParkPilot inside Nimiq Pay to connect your wallet.
        </p>
      ) : wallet.address ? (
        <div className="space-y-2.5">
          <div className="rounded-xl bg-surface p-3">
            <p className="text-[11px] text-ink-muted">Address</p>
            <p className="font-mono text-[13px]">
              {shortenAddress(wallet.address, 6)}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-xl bg-surface p-3">
              <p className="text-[11px] text-ink-muted">USDT</p>
              <p className="text-[17px] font-semibold">
                {wallet.usdtBalance === null
                  ? '—'
                  : formatUsdt(wallet.usdtBalance)}
              </p>
            </div>
            <div className="rounded-xl bg-surface p-3">
              <p className="text-[11px] text-ink-muted">POL (gas)</p>
              <p className="text-[17px] font-semibold">
                {wallet.polBalance === null
                  ? '—'
                  : Number(wallet.polBalance).toFixed(4)}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="md"
              onClick={() => void wallet.refreshBalances()}
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
          Connect Wallet
        </Button>
      )}

      {wallet.error ? (
        <p className="text-[13px] text-danger">{wallet.error}</p>
      ) : null}
    </Card>
  )
}
