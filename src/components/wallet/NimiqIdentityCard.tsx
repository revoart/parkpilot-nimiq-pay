import { Fingerprint } from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { StatusPill } from '@/components/ui/StatusPill'
import { useNimiq } from '@/hooks/useNimiq'
import { shortenAddress } from '@/utils/format'

function createChallenge(): string {
  const cryptoObj = globalThis.crypto
  const id =
    cryptoObj && typeof cryptoObj.randomUUID === 'function'
      ? cryptoObj.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10)
  return `PARKPILOT-${id.toUpperCase()}`
}

export function NimiqIdentityCard() {
  const nimiq = useNimiq()

  const account = nimiq.accounts?.[0] ?? null

  async function handleVerify() {
    const accounts = await nimiq.connect()
    if (!accounts?.length) return
    const challenge = createChallenge()
    const message = [
      'ParkPilot wallet verification',
      `Challenge: ${challenge}`,
      'Purpose: Verify control of this Nimiq wallet for your ParkPilot account.',
    ].join('\n')
    await nimiq.sign(message)
  }

  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <Fingerprint className="size-[18px]" />
          </span>
          <div>
            <p className="text-[14px] font-semibold">Nimiq identity</p>
            <p className="text-[11px] text-ink-muted">Optional verification</p>
          </div>
        </div>
        {nimiq.signature ? (
          <StatusPill tone="success">Signed</StatusPill>
        ) : account ? (
          <StatusPill tone="accent">Linked</StatusPill>
        ) : (
          <StatusPill tone="neutral">Not linked</StatusPill>
        )}
      </div>

      {!nimiq.insideNimiqPay ? (
        <p className="rounded-xl bg-surface p-3 text-[13px] text-ink-soft">
          Nimiq identity is available inside Nimiq Pay.
        </p>
      ) : (
        <div className="space-y-2.5">
          {account ? (
            <div className="rounded-xl bg-surface p-3">
              <p className="text-[11px] text-ink-muted">Nimiq address</p>
              <p className="font-mono text-[13px]">
                {shortenAddress(account, 6)}
              </p>
            </div>
          ) : null}
          {nimiq.signature ? (
            <div className="rounded-xl bg-surface p-3">
              <p className="text-[11px] text-ink-muted">Signature</p>
              <p className="break-all font-mono text-[11px]">
                {nimiq.signature.signature}
              </p>
            </div>
          ) : null}
          <Button
            variant="secondary"
            onClick={() => void handleVerify()}
            loading={nimiq.loading}
          >
            {account ? 'Sign verification message' : 'Link Nimiq wallet'}
          </Button>
        </div>
      )}

      {nimiq.error ? <p className="text-[13px] text-danger">{nimiq.error}</p> : null}
    </Card>
  )
}
