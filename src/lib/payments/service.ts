import { getSupabase } from '@/lib/supabase/client'
import { readFunctionError } from '@/lib/supabase/functions'
import type { VerifyPaymentResult } from '@/types'

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Ask the backend to verify a NIM payment on the Nimiq chain. */
export async function verifyNimPayment(
  reservationId: string,
  txHash: string,
): Promise<VerifyPaymentResult> {
  const supabase = getSupabase()
  const { data, error } = await supabase.functions.invoke('verify-nim-payment', {
    body: { reservation_id: reservationId, tx_hash: txHash },
  })

  if (error) {
    throw new Error(await readFunctionError(error, 'Payment verification failed.'))
  }

  const result = data as (VerifyPaymentResult & { error?: string }) | null
  if (!result || result.error) {
    throw new Error(result?.error ?? 'Payment verification failed.')
  }

  return result
}

export interface PollPaymentOptions {
  attempts?: number
  intervalMs?: number
  onUpdate?: (result: VerifyPaymentResult) => void
}

/**
 * Poll the verifier until the payment is confirmed, fails, or the attempt
 * budget is exhausted. Verification is idempotent server-side.
 *
 * A transaction the network has not seen yet comes back as
 * `payment_submitted`, which keeps the loop going rather than failing — a Nimiq
 * transaction can sit in the mempool for a while before it is mined.
 */
export async function pollNimPayment(
  reservationId: string,
  txHash: string,
  options: PollPaymentOptions = {},
): Promise<VerifyPaymentResult> {
  const attempts = options.attempts ?? 20
  const intervalMs = options.intervalMs ?? 3000
  let last: VerifyPaymentResult | null = null

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const result = await verifyNimPayment(reservationId, txHash)
    last = result
    options.onUpdate?.(result)

    if (
      result.status === 'payment_confirmed' ||
      result.status === 'payment_failed'
    ) {
      return result
    }

    await delay(intervalMs)
  }

  return (
    last ?? {
      status: 'payment_submitted',
      reservation_status: 'reservation_pending',
      tx_hash: txHash,
      block_number: null,
      explorer_url: '',
      reason: 'Verification is taking longer than expected.',
    }
  )
}
