import { useNimPrice } from '@/hooks/useNimPrice'
import { formatUsdAmount, usdtValueOfNim } from '@/lib/nimiq/price'
import { cn } from '@/utils/cn'

/**
 * The dollar equivalent of a NIM amount.
 *
 * NIM is worth a fraction of a cent, so "5000" on a listing tells a host or
 * driver nothing about what it costs. This renders "≈ 1.90 USDT" beside it.
 *
 * Renders nothing when the rate is unavailable or too old, or when the amount
 * is zero. Showing a stale or absent rate as a number would invite someone to
 * price a space or approve a payment against a figure we are not confident in,
 * so the equivalent simply disappears — the NIM amount is always the truth.
 */
export function UsdEquivalent({
  nim,
  className,
}: {
  /** A NIM amount, as the decimal strings the database returns. */
  nim: string | number | null | undefined
  className?: string
}) {
  const { rateUsdt, stale } = useNimPrice()

  if (rateUsdt === null || stale) return null

  const value = usdtValueOfNim(nim, rateUsdt)
  if (value <= 0) return null

  return (
    <span className={cn('whitespace-nowrap', className)}>
      ≈ {formatUsdAmount(value)} USDT
    </span>
  )
}
