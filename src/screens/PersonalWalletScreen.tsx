import { ChevronRight, ExternalLink, RefreshCw, Wallet } from 'lucide-react'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

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
 * A group heading, because the whole point of this screen is to separate two
 * things that are easy to conflate:
 *
 *   * Nimiq Pay owns the wallet. One balance, on the Nimiq chain.
 *   * ParkPilot owns the roles. Driver and Host are ways of using that wallet,
 *     not additional wallets.
 *
 * Keeping them under named owners makes the distinction structural rather than
 * something a reader has to infer from a sentence.
 */
function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2.5">
      <p className="px-1 text-[11px] font-extrabold uppercase tracking-[1.4px] text-ink-muted">
        {title}
      </p>
      {children}
    </section>
  )
}

/**
 * The single wallet.
 *
 * There is exactly one balance on this screen and it is read from the Nimiq
 * chain. Host earnings appear under ParkPilot as an accounting figure, never
 * inside the balance and never added to it — there is deliberately no combined
 * "total", because there is only one pot of money.
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
      <div className="space-y-6">
        <Group title="Nimiq Pay">
          <Card className="space-y-4 p-4">
            <div className="space-y-1">
              <Eyebrow>Personal Wallet</Eyebrow>
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

            <p className="text-[12px] leading-5 text-ink-muted">
              This is your actual Nimiq wallet — the one balance on the chain.
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
        </Group>

        {/*
          ParkPilot owns the roles, not the money. Driver and Host are two ways of
          using the same wallet, and host earnings are an accounting attribution
          of activity — never a second balance, and never added to the one above.
        */}
        <Group title="ParkPilot">
          <Card className="divide-y divide-line">
            <div className="p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[15px] font-bold tracking-[-0.2px]">Driver</p>
                  <p className="mt-0.5 text-[12px] leading-5 text-ink-muted">
                    Book parking with your NIM.
                  </p>
                </div>
                <Link
                  to="/"
                  className="inline-flex shrink-0 items-center gap-0.5 text-[13px] font-semibold text-brand active:opacity-90"
                >
                  Find parking
                  <ChevronRight className="size-4" />
                </Link>
              </div>
            </div>

            <div className="p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[15px] font-bold tracking-[-0.2px]">Host</p>
                  <p className="mt-0.5 text-[12px] leading-5 text-ink-muted">
                    Host earnings:{' '}
                    <span className="font-semibold text-ink">
                      {earnings ? `${formatNim(earnings.available)} NIM` : '—'}
                    </span>
                  </p>
                </div>
                <Link
                  to="/host/earnings"
                  className="inline-flex shrink-0 items-center gap-0.5 text-[13px] font-semibold text-brand active:opacity-90"
                >
                  Earnings
                  <ChevronRight className="size-4" />
                </Link>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3">
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

              <p className="mt-3 text-[12px] leading-5 text-ink-muted">
                Host earnings are an accounting record, not a wallet. ParkPilot
                pays them into your account when you withdraw, so they are not
                part of the balance above — and the two are never added together.
              </p>
            </div>
          </Card>
        </Group>

        <Group title="Activity">
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
        </Group>
      </div>
    </AppShell>
  )
}
