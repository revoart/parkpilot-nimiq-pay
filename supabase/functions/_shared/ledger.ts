import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

export interface PlatformConfig {
  feeBps: number
  treasuryAddress: string
  minPayoutUsdt: number
}

const DEFAULT_FEE_BPS = 1000
const DEFAULT_MIN_PAYOUT = 1

/** Platform fee + treasury + payout floor, read from platform_settings. */
export async function getPlatformConfig(
  supabase: SupabaseClient,
): Promise<PlatformConfig> {
  const { data } = await supabase.from('platform_settings').select('key, value')
  const map = new Map<string, unknown>(
    (data ?? []).map((row) => [row.key as string, row.value]),
  )

  const feeBps = Number(map.get('platform_fee_bps') ?? DEFAULT_FEE_BPS)
  const treasuryAddress = String(map.get('treasury_address') ?? '')
  const minPayoutUsdt = Number(
    map.get('min_payout_usdt') ?? DEFAULT_MIN_PAYOUT,
  )

  return {
    feeBps: Number.isFinite(feeBps) ? feeBps : DEFAULT_FEE_BPS,
    treasuryAddress,
    minPayoutUsdt: Number.isFinite(minPayoutUsdt)
      ? minPayoutUsdt
      : DEFAULT_MIN_PAYOUT,
  }
}

/** Integer-only fee split — never floating point. */
export function splitRaw(
  grossRaw: bigint,
  feeBps: number,
): { hostRaw: bigint; feeRaw: bigint } {
  const feeRaw = (grossRaw * BigInt(Math.max(0, Math.round(feeBps)))) / 10_000n
  return { hostRaw: grossRaw - feeRaw, feeRaw }
}

/** Find or create a ledger account, returning its id. */
export async function ensureAccount(
  supabase: SupabaseClient,
  ownerType: 'host' | 'treasury',
  ownerAddress: string,
): Promise<string> {
  const address = ownerAddress.toLowerCase()

  const { data: existing } = await supabase
    .from('ledger_accounts')
    .select('id')
    .eq('owner_type', ownerType)
    .ilike('owner_address', address)
    .eq('currency', 'USDT')
    .maybeSingle()

  if (existing) return existing.id as string

  const { data, error } = await supabase
    .from('ledger_accounts')
    .insert({ owner_type: ownerType, owner_address: address, currency: 'USDT' })
    .select('id')
    .single()

  if (error) {
    // Concurrent insert — re-read.
    if (error.code === '23505') {
      const { data: raced } = await supabase
        .from('ledger_accounts')
        .select('id')
        .eq('owner_type', ownerType)
        .ilike('owner_address', address)
        .eq('currency', 'USDT')
        .maybeSingle()
      if (raced) return raced.id as string
    }
    throw error
  }

  return data.id as string
}

export interface LedgerPosting {
  accountId: string
  entryType: 'earning' | 'fee' | 'payout' | 'refund' | 'adjustment'
  direction: 'credit' | 'debit'
  amountUsdt: string
  amountRaw: bigint
  reservationId?: string | null
  paymentId?: string | null
  payoutId?: string | null
}

/**
 * Post a ledger entry. Idempotent for payment-linked entries — the unique
 * (payment_id, entry_type) index guarantees a payment is credited once.
 */
export async function postLedgerEntry(
  supabase: SupabaseClient,
  posting: LedgerPosting,
): Promise<void> {
  const { error } = await supabase.from('ledger_entries').insert({
    account_id: posting.accountId,
    reservation_id: posting.reservationId ?? null,
    payment_id: posting.paymentId ?? null,
    payout_id: posting.payoutId ?? null,
    entry_type: posting.entryType,
    direction: posting.direction,
    amount_usdt: posting.amountUsdt,
    amount_raw: posting.amountRaw.toString(),
  })

  // 23505 = unique_violation → already posted, which is exactly what we want.
  if (error && error.code !== '23505') throw error
}

export interface CreditPaymentInput {
  hostAddress: string
  treasuryAddress: string
  reservationId: string
  paymentId: string
  hostAmountUsdt: string
  hostAmountRaw: bigint
  feeAmountUsdt: string
  feeAmountRaw: bigint
}

/**
 * Credit a verified payment: host earning (net) and, when non-zero, the
 * ParkPilot treasury fee. Both postings are idempotent by payment id.
 */
export async function creditPayment(
  supabase: SupabaseClient,
  input: CreditPaymentInput,
): Promise<void> {
  const hostAccount = await ensureAccount(supabase, 'host', input.hostAddress)

  await postLedgerEntry(supabase, {
    accountId: hostAccount,
    entryType: 'earning',
    direction: 'credit',
    amountUsdt: input.hostAmountUsdt,
    amountRaw: input.hostAmountRaw,
    reservationId: input.reservationId,
    paymentId: input.paymentId,
  })

  if (input.feeAmountRaw > 0n) {
    const treasuryAccount = await ensureAccount(
      supabase,
      'treasury',
      input.treasuryAddress,
    )
    await postLedgerEntry(supabase, {
      accountId: treasuryAccount,
      entryType: 'fee',
      direction: 'credit',
      amountUsdt: input.feeAmountUsdt,
      amountRaw: input.feeAmountRaw,
      reservationId: input.reservationId,
      paymentId: input.paymentId,
    })
  }
}

export interface HostWalletSummary {
  available: number
  pending: number
  totalEarned: number
  totalWithdrawn: number
}

/** Derive a host's balances from the ledger (never a mutable counter). */
export async function getHostWalletSummary(
  supabase: SupabaseClient,
  hostAddress: string,
): Promise<HostWalletSummary> {
  const address = hostAddress.toLowerCase()

  const { data: account } = await supabase
    .from('ledger_accounts')
    .select('id')
    .eq('owner_type', 'host')
    .ilike('owner_address', address)
    .eq('currency', 'USDT')
    .maybeSingle()

  let totalEarned = 0
  let totalWithdrawn = 0

  if (account) {
    const { data: entries } = await supabase
      .from('ledger_entries')
      .select('entry_type, direction, amount_usdt')
      .eq('account_id', account.id)

    for (const entry of entries ?? []) {
      const amount = Number(entry.amount_usdt)
      if (!Number.isFinite(amount)) continue
      if (entry.entry_type === 'earning' && entry.direction === 'credit') {
        totalEarned += amount
      }
      if (entry.entry_type === 'payout' && entry.direction === 'debit') {
        totalWithdrawn += amount
      }
    }
  }

  const { data: inFlight } = await supabase
    .from('payouts')
    .select('amount_usdt')
    .ilike('host_address', address)
    .in('status', ['requested', 'processing'])

  const reserved = (inFlight ?? []).reduce(
    (sum, row) => sum + Number(row.amount_usdt ?? 0),
    0,
  )

  // Pending = reserved-but-unpaid host earnings on open reservations.
  const { data: spaces } = await supabase
    .from('parking_spaces')
    .select('id')
    .ilike('owner_evm_address', address)

  let pending = 0
  const spaceIds = (spaces ?? []).map((row) => row.id as string)
  if (spaceIds.length > 0) {
    const { data: reservations } = await supabase
      .from('reservations')
      .select('host_amount_usdt')
      .in('parking_space_id', spaceIds)
      .eq('status', 'reservation_pending')

    pending = (reservations ?? []).reduce(
      (sum, row) => sum + Number(row.host_amount_usdt ?? 0),
      0,
    )
  }

  const available = Math.max(0, totalEarned - totalWithdrawn - reserved)

  const round = (value: number) => Number(value.toFixed(6))

  return {
    available: round(available),
    pending: round(pending),
    totalEarned: round(totalEarned),
    totalWithdrawn: round(totalWithdrawn),
  }
}
