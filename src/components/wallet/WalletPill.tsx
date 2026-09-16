import { NimiqMark } from '@/components/brand/NimiqMark'
import { ChainBadge } from '@/components/wallet/ChainBadge'
import { useWallet } from '@/hooks/useWallet'
import { cn } from '@/utils/cn'
import { shortenAddress } from '@/utils/format'

/**
 * Wallet pill from the Figma component sheet. Three states are specified:
 * connected (mark + address + chain badge + status dot), connect, and a loading
 * skeleton while the wallet prompt is open.
 */
export function WalletPill({ className }: { className?: string }) {
  const wallet = useWallet()

  if (wallet.address) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-raised py-1 pl-1.5 pr-2 text-[11px] font-bold tracking-[-0.1px]',
          className,
        )}
      >
        <NimiqMark className="size-4" />
        <span className="truncate">{shortenAddress(wallet.address, 4)}</span>
        <ChainBadge />
        <span
          aria-hidden="true"
          className={cn(
            'size-1.5 shrink-0 rounded-full',
            wallet.onPolygon ? 'bg-success' : 'bg-warning',
          )}
        />
        <span className="sr-only">
          {wallet.onPolygon ? 'Connected to Polygon' : 'Wrong network'}
        </span>
      </span>
    )
  }

  if (wallet.status === 'connecting') {
    return (
      <span
        aria-hidden="true"
        className={cn(
          'inline-flex h-7 w-32 animate-pulse items-center rounded-full bg-line-strong/60',
          className,
        )}
      />
    )
  }

  return (
    <button
      type="button"
      onClick={() => void wallet.connect()}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-brand/45 bg-surface-raised px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-[0.3px] text-brand transition active:scale-[0.97] active:opacity-90',
        className,
      )}
    >
      Connect Wallet
    </button>
  )
}
