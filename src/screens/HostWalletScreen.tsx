import { ArrowUpRight, ExternalLink, Wallet } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { HostShell } from '@/components/layout/HostShell'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { StatusPill } from '@/components/ui/StatusPill'
import { useToast } from '@/components/ui/Toast'
import { useWallet } from '@/hooks/useWallet'
import { getHostWallet, requestPayout, type HostWallet } from '@/lib/host'
import { explorerTxUrl } from '@/utils/explorer'
import { hapticConfirm } from '@/utils/haptics'
import { formatDateLabel, formatUsdt, shortenAddress } from '@/utils/format'

const PAYOUT_TONE = {
  requested: 'warning',
  processing: 'accent',
  paid: 'success',
  failed: 'danger',
} as const

export function HostWalletScreen() {
  const wallet = useWallet()
  const toast = useToast()
  const [data, setData] = useState<HostWallet | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [payoutAddress, setPayoutAddress] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!wallet.address) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const result = await getHostWallet(wallet.address)
      setData(result)
      setPayoutAddress((current) => current || result.payout_address || '')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load.')
    } finally {
      setLoading(false)
    }
  }, [wallet.address])

  useEffect(() => {
    void load()
  }, [load])

  async function handleWithdrawal() {
    if (!wallet.address || !data) return
    setNotice(null)

    const value = Number(amount)
    if (!Number.isFinite(value) || value <= 0) {
      setNotice('Enter a valid amount.')
      return
    }
    if (value < data.min_payout_usdt) {
      setNotice(`Minimum payout is ${data.min_payout_usdt} USDT.`)
      return
    }
    if (value > data.available) {
      setNotice('Amount exceeds your available balance.')
      return
    }
    if (!/^0x[0-9a-fA-F]{40}$/.test(payoutAddress.trim())) {
      setNotice('Enter a valid payout address.')
      return
    }

    setSubmitting(true)
    try {
      await requestPayout(wallet.address, value, payoutAddress.trim())
      setOpen(false)
      setAmount('')
      setNotice('Withdrawal requested. ParkPilot will process it shortly.')
      toast.show('Withdrawal requested.', 'success')
      hapticConfirm()
      await load()
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Could not request payout.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!wallet.address) {
    return (
      <HostShell title="Wallet" subtitle="Host">
        <EmptyState
          icon={<Wallet className="size-5" />}
          title="Connect your wallet"
          description="Connect Nimiq Pay to see your host wallet."
          action={
            <Button size="md" onClick={() => void wallet.connect()}>
              Connect Wallet
            </Button>
          }
        />
      </HostShell>
    )
  }

  const feePercent = data ? (data.fee_bps / 100).toFixed(0) : '10'

  return (
    <HostShell title="Wallet" subtitle="Host">
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : error || !data ? (
        <EmptyState
          title="Couldn't load your wallet"
          description={error ?? 'Try again.'}
          action={
            <Button variant="secondary" size="md" onClick={() => void load()}>
              Retry
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          <div className="rounded-2xl bg-surface-raised p-5">
            <p className="text-[11px] font-bold uppercase tracking-[1.2px] text-ink-faint">
              Available balance
            </p>
            <p className="mt-1 text-[40px] font-bold leading-none tracking-[-1.2px]">
              {formatUsdt(data.available)}
              <span className="ml-1 text-[14px] font-semibold text-ink-muted">
                USDT
              </span>
            </p>
            <p className="mt-2 text-[12px] text-ink-muted">
              ParkPilot keeps a {feePercent}% platform fee. Payouts go to your
              own wallet — ParkPilot never holds your keys.
            </p>
            <div className="mt-4">
              <Button
                full
                size="lg"
                disabled={data.available < data.min_payout_usdt}
                onClick={() => {
                  setNotice(null)
                  setOpen(true)
                }}
              >
                <ArrowUpRight className="mr-2 size-4" />
                Withdraw USDT
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Pending', value: data.pending },
              { label: 'Total earned', value: data.totalEarned },
              { label: 'Withdrawn', value: data.totalWithdrawn },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-2xl bg-surface-raised px-3 py-3 text-center"
              >
                <p className="text-[18px] font-bold leading-none">
                  {formatUsdt(stat.value)}
                </p>
                <p className="mt-1.5 text-[10px] font-medium leading-tight text-ink-muted">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>

          {notice ? (
            <p className="rounded-xl bg-surface-raised px-4 py-3 text-sm text-ink-soft">
              {notice}
            </p>
          ) : null}

          <div className="rounded-2xl bg-surface-raised p-4">
            <p className="mb-3 font-bold">Recent transactions</p>
            {data.payouts.length === 0 ? (
              <p className="py-2 text-sm text-ink-muted">
                No withdrawals yet. Your confirmed bookings credit this balance.
              </p>
            ) : (
              <div className="space-y-3">
                {data.payouts.map((payout) => (
                  <div
                    key={payout.id}
                    className="flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-[14px] font-semibold">
                        Withdrawal to {shortenAddress(payout.payout_address, 4)}
                      </p>
                      <p className="text-xs text-ink-muted">
                        {formatDateLabel(payout.requested_at)}
                      </p>
                      {payout.tx_hash ? (
                        <a
                          href={explorerTxUrl(payout.tx_hash)}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-brand"
                        >
                          <ExternalLink className="size-3" />
                          View transaction
                        </a>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-[14px] font-bold">
                        {formatUsdt(payout.amount_usdt)}
                      </span>
                      <StatusPill tone={PAYOUT_TONE[payout.status]}>
                        {payout.status}
                      </StatusPill>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <BottomSheet
        open={open}
        title="Withdraw USDT"
        onClose={() => setOpen(false)}
      >
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label
              htmlFor="payout-amount"
              className="text-xs font-semibold text-ink-soft"
            >
              Amount (USDT)
            </label>
            <input
              id="payout-amount"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              inputMode="decimal"
              placeholder={data ? String(data.available) : '0.00'}
              className="w-full rounded-xl bg-surface px-3.5 py-3 text-[14px] outline-none placeholder:text-ink-faint"
            />
            {data ? (
              <p className="text-[11px] text-ink-muted">
                Available {formatUsdt(data.available)} USDT · minimum{' '}
                {data.min_payout_usdt} USDT
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="payout-address"
              className="text-xs font-semibold text-ink-soft"
            >
              Payout address (Polygon)
            </label>
            <input
              id="payout-address"
              value={payoutAddress}
              onChange={(event) => setPayoutAddress(event.target.value)}
              placeholder="0x…"
              className="w-full rounded-xl bg-surface px-3.5 py-3 font-mono text-[13px] outline-none placeholder:text-ink-faint"
            />
          </div>

          {notice ? <p className="text-sm text-danger">{notice}</p> : null}

          <Button
            full
            size="lg"
            loading={submitting}
            onClick={() => void handleWithdrawal()}
          >
            Request withdrawal
          </Button>
        </div>
      </BottomSheet>
    </HostShell>
  )
}
