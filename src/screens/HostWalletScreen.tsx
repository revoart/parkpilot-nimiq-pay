import { ExternalLink, Wallet } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { NimiqMark } from '@/components/brand/NimiqMark'
import { HostShell } from '@/components/layout/HostShell'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { StatusPill } from '@/components/ui/StatusPill'
import { useToast } from '@/components/ui/Toast'
import { UsdEquivalent } from '@/components/ui/UsdEquivalent'
import { useWallet } from '@/hooks/useWallet'
import { getHostWallet, requestPayout, type HostWallet } from '@/lib/host'
import { isValidNimiqAddress, normalizeNimiqAddress } from '@/lib/nimiq'
import { cn } from '@/utils/cn'
import { explorerTxUrl } from '@/utils/explorer'
import { hapticConfirm } from '@/utils/haptics'
import { formatDateLabel, formatNim, shortenAddress } from '@/utils/format'

const PAYOUT_TONE = {
  requested: 'warning',
  processing: 'accent',
  paid: 'success',
  failed: 'danger',
} as const

const PAYOUT_LABEL = {
  requested: 'Requested',
  processing: 'Processing',
  paid: 'Completed',
  failed: 'Failed',
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
    if (value < data.min_payout_nim) {
      setNotice(`Minimum payout is ${data.min_payout_nim} NIM.`)
      return
    }
    if (value > data.available) {
      setNotice('Amount exceeds your available balance.')
      return
    }
    if (!isValidNimiqAddress(payoutAddress.trim())) {
      setNotice('Enter a valid Nimiq payout address.')
      return
    }

    setSubmitting(true)
    try {
      await requestPayout(wallet.address, value, normalizeNimiqAddress(payoutAddress))
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
      <HostShell title="Earnings">
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
    <HostShell
      title="Earnings"
      footer={
        // Only once the wallet has loaded: the CTA reads `data`, and there is
        // nothing to withdraw from while the screen is still fetching.
        data ? (
          <Button
            full
            size="lg"
            variant="accent"
            disabled={data.available < data.min_payout_nim}
            onClick={() => {
              setNotice(null)
              setOpen(true)
            }}
          >
            Withdraw Earnings
          </Button>
        ) : null
      }
    >
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="mx-auto h-24 w-48 rounded-2xl" />
          <div className="grid grid-cols-3 gap-2.5">
            <Skeleton className="h-[68px] rounded-2xl" />
            <Skeleton className="h-[68px] rounded-2xl" />
            <Skeleton className="h-[68px] rounded-2xl" />
          </div>
          <Skeleton className="h-[104px] rounded-2xl" />
          <Skeleton className="h-[104px] rounded-2xl" />
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
        <div className="space-y-5">
          <div className="flex flex-col items-center gap-2 text-center">
            <p className="text-[11px] font-bold uppercase tracking-[1.2px] text-ink-faint">
              Available for withdrawal
            </p>
            <div className="flex items-center gap-2">
              <NimiqMark className="size-9" />
              <span className="text-[40px] font-extrabold leading-none tracking-[-1.2px]">
                {formatNim(data.available)}
              </span>
              <span className="text-[18px] font-bold text-brand">NIM</span>
            </div>
            <UsdEquivalent
              nim={data.available}
              className="text-[13px] text-ink-muted"
            />
            <p className="text-[13px] text-ink-muted">
              {feePercent}% platform fee applied • Automatically cleared
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            {[
              { label: 'Pending', value: data.pending },
              { label: 'Total earned', value: data.totalEarned },
              { label: 'Withdrawn', value: data.totalWithdrawn },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-2xl bg-surface-raised px-3 py-3 shadow-[0_4px_12px_rgba(0,0,0,0.04)]"
              >
                <p className="text-[10px] font-bold uppercase leading-none tracking-[0.6px] text-ink-faint">
                  {stat.label}
                </p>
                <p className="mt-1.5 flex items-center gap-1 text-[17px] font-extrabold leading-none tracking-[-0.4px]">
                  {formatNim(stat.value)}
                  <span className="text-[11px] font-bold text-ink-muted">
                    NIM
                  </span>
                </p>
                <UsdEquivalent
                  nim={stat.value}
                  className="mt-1 block text-[10px] text-ink-muted"
                />
              </div>
            ))}
          </div>

          {notice ? (
            <p className="rounded-2xl bg-surface-raised px-4 py-3 text-[13px] text-ink-soft">
              {notice}
            </p>
          ) : null}

          <section className="space-y-2.5">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.8px] text-ink-faint">
              Payout history (on-chain)
            </h2>
            {data.payouts.length === 0 ? (
              <EmptyState
                icon={<Wallet className="size-5" />}
                title="No withdrawals yet"
                description="Your confirmed bookings credit this balance."
              />
            ) : (
              <div className="space-y-2.5">
                {data.payouts.map((payout) => (
                  <div
                    key={payout.id}
                    className="rounded-2xl bg-surface-raised p-3.5 shadow-[0_4px_12px_rgba(0,0,0,0.04)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-[16px] font-bold tracking-[-0.3px]">
                        NIM Withdrawal
                      </p>
                      <p
                        className={cn(
                          'shrink-0 text-[15px] font-bold',
                          payout.status === 'paid'
                            ? 'text-success'
                            : payout.status === 'failed'
                              ? 'text-danger'
                              : 'text-ink',
                        )}
                      >
                        {payout.status === 'failed' ? '' : '+'}
                        {formatNim(payout.amount_nim)} NIM
                        <UsdEquivalent
                          nim={payout.amount_nim}
                          className="mt-0.5 block text-[11px] font-medium text-ink-muted"
                        />
                      </p>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between gap-3">
                      <p className="text-[13px] text-ink-muted">
                        {formatDateLabel(payout.requested_at)}
                      </p>
                      <StatusPill tone={PAYOUT_TONE[payout.status]}>
                        {PAYOUT_LABEL[payout.status]}
                      </StatusPill>
                    </div>
                    {payout.tx_hash ? (
                      <>
                        <div className="my-2.5 border-t border-line" />
                        <div className="flex items-center justify-between gap-3">
                          <p className="truncate font-mono text-[12px] text-ink-muted">
                            Tx: {shortenAddress(payout.tx_hash, 4)}
                          </p>
                          <a
                            href={explorerTxUrl(payout.tx_hash)}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex shrink-0 items-center gap-1 text-[13px] font-bold text-brand underline"
                          >
                            View
                            <ExternalLink className="size-3.5" />
                          </a>
                        </div>
                      </>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      <BottomSheet
        open={open}
        title="Withdraw NIM"
        onClose={() => setOpen(false)}
      >
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label
              htmlFor="payout-amount"
              className="text-xs font-semibold text-ink-soft"
            >
              Amount (NIM)
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
                Available {formatNim(data.available)} NIM · minimum{' '}
                {data.min_payout_nim} NIM
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="payout-address"
              className="text-xs font-semibold text-ink-soft"
            >
              Payout address (Nimiq)
            </label>
            <input
              id="payout-address"
              value={payoutAddress}
              onChange={(event) => setPayoutAddress(event.target.value)}
              placeholder="NQ…"
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
