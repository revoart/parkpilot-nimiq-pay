import { Wallet } from 'lucide-react'

import { useWallet } from '@/hooks/useWallet'
import { shortenAddress } from '@/utils/format'

export function WalletPill() {
  const wallet = useWallet()

  if (wallet.address) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-raised px-2.5 py-1 text-[11px] font-semibold">
        <span className="size-2 rounded-full bg-success" />
        {shortenAddress(wallet.address, 4)}
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={() => void wallet.connect()}
      disabled={wallet.status === 'connecting'}
      className="inline-flex items-center gap-1.5 rounded-full bg-accent px-2.5 py-1 text-[11px] font-semibold text-on-ink disabled:opacity-60"
    >
      <Wallet className="size-3" />
      {wallet.status === 'connecting' ? 'Connecting…' : 'Connect'}
    </button>
  )
}
