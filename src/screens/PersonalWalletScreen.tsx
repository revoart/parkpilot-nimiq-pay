import { ExternalLink, RefreshCw, Wallet } from 'lucide-react'
import { useCallback, useEffect, useState, type ReactNode } from 'react'

import { NimiqMark } from '@/components/brand/NimiqMark'
import { AppShell } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { StateCard } from '@/components/ui/StateCard'
import { UsdEquivalent } from '@/components/ui/UsdEquivalent'
import { useNimBalance } from '@/hooks/useNimBalance'
import { useTransactions } from '@/hooks/useTransactions'
import { useWallet } from '@/hooks/useWallet'
import { getHostEarnings, type HostEarnings } from '@/lib/host'
import { formatNimiqAddress, lunaToNim } from '@/lib/nimiq'
import {
  transactionAmountNim,
  transactionSign,
  transactionTitle,
} from '@/lib/transactions'
import { cn } from '@/utils/cn'
import { explorerTxUrl } from '@/utils/explorer'
import { formatDateLabel, formatNim } from '@/utils/format'

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="text-[10px] font-extrabold uppercase tracking-[1.2px] text-ink-faint dark:text-ink-muted">
      {children}
    </p>
  )
}

/**
 * The single wallet.
 *
 * There is exactly one balance here, and it is read from the Nimiq chain. Host
 * earnings are shown beside it as a separate, labelled accounting figure — they
 * are never added to the balance and there is no "total". If the two numbers
 * look inconsistent, that is real information about the payout state, not a
 * bug to paper over.
 */
export function PersonalWalletScreen() {
  const wallet = useWallet()
  const { balanceLuna, loading: balanceLoading, refresh: refreshBalance } =
    useNimBalance(wallet.address)
  const { transactions, loading, error, refresh } = useTransactions(wallet.address)

  const [earnings, setEarnings] = useState<HostEarnings | null>(null)

  const loadEarnings = useCallback(async () => {
    if (!wallet.address) {
      setEarnings(null)
      return
    }
    try {
      setEarnings(await getHostEarnings(wallet.address))
    } catch {
      // The wallet balance is the truth; earnings are supplementary. A failed
      // earnings read must not blank out the balance.
      setEarnings(null)
    }
  }, [wallet.address])

  useEffect(() => {
    void loadEarnings()
  }, [loadEarnings])

  const refreshAll = useCallback(async () => {
    await Promise.all([refreshBalance(), refresh(), loadEarnings()])
  }, [refreshBalance, refresh, loadEarnings])

  if (!wallet.address) {
    return (
      <AppShell showBack title="Personal Wallet">
        <StateCard
          tone="brand"
          icon={<Wallet className="size-6" />}
          title="Connect in Nimiq Pay"
          description={
            wallet.providerAvailable
              ? 'Connect your Nimiq Pay account to see your one real balance on the Nimiq chain.'
              : 'Open ParkPilot inside Nimiq Pay to connect your account and see your balance.'
          }
        >
          <Button
            full
            size="lg"
            onClick={() => void wallet.connect()}
            loading={wallet.status === 'connecting'}
          >
            Connect in Nimiq Pay
          </Button>
          {wallet.error ? (
            <p className="text-center text-[13px] text-danger">{wallet.error}</p>
          ) : null}
        </StateCard>
      </AppShell>
    )
  }

  const nimBalance = balanceLuna === null ? null : lunaToNim(balanceLuna)

  return (
    <AppShell showBack title="Personal Wallet">
      <div className="space-y-5">
        <Card className="space-y-4 p-4">
          <Eyebrow>Personal Wallet</Eyebrow>
          <p className="text-[13px] leading-5 text-ink-muted">
            This is your Nimiq Pay wallet — one real balance on the Nimiq chain.
          </p>

          <div className="space-y-1">
            <Eyebrow>NIM Balance</Eyebrow>
            <div className="flex items-baseline gap-2">
              <NimiqMark className="size-8 shrink-0 self-center" />
              <span className="text-[40px] font-extrabold leading-none tracking-[-1.2px]">
                {nimBalance === null ? '—' : formatNim(nimBalance)}
              </span>
              <span className="text-[20px] font-extrabold leading-none text-brand">
                NIM
              </span>
            </div>
            <UsdEquivalent
              nim={nimBalance}
              className="block text-[13px] text-ink-muted"
            />
          </div>

          <p className="break-all font-mono text-[12px] text-ink-faint">
            {formatNimiqAddress(wallet.address)}
          </p>

          <button
            type="button"
            onClick={() => void refreshAll()}
            className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-brand active:opacity-90"
          >
            <RefreshCw className={cn('size-4', balanceLoading && 'animate-spin')} />
            Refresh
          </button>
        </Card>

        {/*
          Host Earnings sit beside the balance, never inside it. This block is
          accounting: it is not a second wallet, it is not added to the balance,
          and there is deliberately no combined "total".
        */}
        <Card className="space-y-3 p-4">
          <Eyebrow>Host Earnings</Eyebrow>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-surface p-3">
              <p className="text-[11px] text-ink-muted">Available Earnings</p>
              <p className="mt-0.5 text-[17px] font-bold leading-none">
                {earnings ? formatNim(earnings.available) : '—'}
              </p>
              {earnings ? (
                <UsdEquivalent
                  nim={earnings.available}
                  className="mt-1 block text-[10px] text-ink-muted"
                />
              ) : null}
            </div>
            <div className="rounded-xl bg-surface p-3">
              <p className="text-[11px] text-ink-muted">Pending Earnings</p>
              <p className="mt-0.5 text-[17px] font-bold leading-none">
                {earnings ? formatNim(earnings.pending) : '—'}
              </p>
              {earnings ? (
                <UsdEquivalent
                  nim={earnings.pending}
                  className="mt-1 block text-[10px] text-ink-muted"
                />
              ) : null}
            </div>
          </div>
          <p className="text-[12px] leading-5 text-ink-muted">
            Host earnings are an accounting record, not a wallet. The NIM is
            held by the ParkPilot treasury and paid into your account when you
            withdraw, so it is not part of the wallet balance above. The two are
            never added together.
          </p>
        </Card>

        <section className="space-y-2.5">
          <Eyebrow>Activity</Eyebrow>

          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full rounded-2xl" />
              <Skeleton className="h-16 w-full rounded-2xl" />
            </div>
          ) : error ? (
            <EmptyState
              tone="danger"
              title="Couldn't load your activity"
              description={error}
              action={
                <Button variant="secondary" size="md" onClick={() => void refresh()}>
                  Retry
                </Button>
              }
            />
          ) : transactions.length === 0 ? (
            <EmptyState
              title="No activity yet"
              description="Payments you make and host earnings you accrue will appear here."
            />
          ) : (
            <div className="space-y-2">
              {transactions.map((entry, index) => (
                <Card
                  key={`${entry.type}-${entry.tx_hash ?? entry.created_at}-${index}`}
                  className="flex items-center justify-between gap-3 p-3.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-bold tracking-[-0.2px]">
                      {transactionTitle(entry)}
                    </p>
                    <p className="mt-0.5 text-[12px] text-ink-muted">
                      {formatDateLabel(entry.created_at)}
                    </p>
                    {entry.tx_hash ? (
                      <a
                        href={explorerTxUrl(entry.tx_hash)}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-0.5 inline-flex items-center gap-1 text-[12px] font-semibold text-brand underline"
                      >
                        Transaction
                        <ExternalLink className="size-3" />
                      </a>
                    ) : null}
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className={cn(
                        'text-[15px] font-bold',
                        entry.direction === 'credit' ? 'text-success' : 'text-ink',
                      )}
                    >
                      {transactionSign(entry)}
                      {transactionAmountNim(entry)} NIM
                    </p>
                    <UsdEquivalent
                      nim={entry.amount_nim}
                      className="mt-0.5 block text-[11px] font-medium text-ink-muted"
                    />
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  )
}
