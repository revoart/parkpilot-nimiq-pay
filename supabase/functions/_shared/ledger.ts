import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

import { lunaToNim, nimToLuna } from './nimiq.ts'

export interface PlatformConfig {
  feeBps: number
  treasuryAddress: string
  minPayoutNim: number
  /** Wallets allowed to settle payouts (signers, when the treasury is a multisig). */
  operatorAddresses: string[]
}

const DEFAULT_FEE_BPS = 1000
/** Matches the `min_payout_nim` row in migration 0022. */
const DEFAULT_MIN_PAYOUT = 5000

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
  const minPayoutNim = Number(
    map.get('min_payout_nim') ?? DEFAULT_MIN_PAYOUT,
  )

  const rawOperators = map.get('operator_addresses')
  const operatorAddresses = Array.isArray(rawOperators)
    ? rawOperators
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.toLowerCase())
    : []

  return {
    feeBps: Number.isFinite(feeBps) ? feeBps : DEFAULT_FEE_BPS,
    treasuryAddress,
    minPayoutNim: Number.isFinite(minPayoutNim)
      ? minPayoutNim
      : DEFAULT_MIN_PAYOUT,
    operatorAddresses,
  }
}

/** Integer-only fee split — never floating point. */
/**
 * Split a gross amount into host and platform shares.
 *
 * The rate is clamped to 0–10000 bps: a misconfigured `platform_fee_bps` above
 * 100% must never produce a fee larger than the gross, which would credit the
 * host a negative amount.
 */
export function splitRaw(
  grossRaw: bigint,
  feeBps: number,
): { hostRaw: bigint; feeRaw: bigint } {
  if (grossRaw <= 0n) return { hostRaw: grossRaw, feeRaw: 0n }

  const rate = BigInt(Math.min(10_000, Math.max(0, Math.round(feeBps))))
  const feeRaw = (grossRaw * rate) / 10_000n
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
    .eq('currency', 'NIM')
    .maybeSingle()

  if (existing) return existing.id as string

  const { data, error } = await supabase
    .from('ledger_accounts')
    .insert({ owner_type: ownerType, owner_address: address, currency: 'NIM' })
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
        .eq('currency', 'NIM')
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
  amountNim: string
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
    amount_nim: posting.amountNim,
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
  hostAmountNim: string
  hostAmountRaw: bigint
  feeAmountNim: string
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
    amountNim: input.hostAmountNim,
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
      amountNim: input.feeAmountNim,
      amountRaw: input.feeAmountRaw,
      reservationId: input.reservationId,
      paymentId: input.paymentId,
    })
  }
}

export interface HostEarningsSummary {
  available: number
  pending: number
  totalEarned: number
  totalWithdrawn: number
}

/** Derive a host's balances from the ledger (never a mutable counter). */
/**
 * Sum a decimal NIM column as exact Luna.
 *
 * `nimToLuna` parses the decimal string with integer arithmetic, so this never
 * touches a float. Rows that cannot be parsed are skipped rather than poisoning
 * the total — one malformed row must not blank out a host's whole balance.
 */
function sumLuna(
  rows: Record<string, unknown>[] | null,
  column: string,
): bigint {
  let total = 0n
  for (const row of rows ?? []) {
    try {
      total += nimToLuna(String(row[column] ?? '0'))
    } catch {
      continue
    }
  }
  return total
}

export async function getHostEarningsSummary(
  supabase: SupabaseClient,
  hostAddress: string,
): Promise<HostEarningsSummary> {
  const address = hostAddress.toLowerCase()

  const { data: account } = await supabase
    .from('ledger_accounts')
    .select('id')
    .eq('owner_type', 'host')
    .ilike('owner_address', address)
    .eq('currency', 'NIM')
    .maybeSingle()

  // Every sum below runs in Luna, the exact integer the chain moves. Adding
  // decimal NIM as floats drifts, and a balance that drifts eventually
  // disagrees with the ledger it was derived from.
  //
  // Ledger entries carry `amount_raw` (Luna); payouts and reservations only
  // carry a decimal NIM string, which `nimToLuna` parses with integer
  // arithmetic rather than through a float.
  let earnedLuna = 0n
  let withdrawnLuna = 0n

  if (account) {
    const { data: entries } = await supabase
      .from('ledger_entries')
      .select('entry_type, direction, amount_raw')
      .eq('account_id', account.id)

    for (const entry of entries ?? []) {
      let amount: bigint
      try {
        amount = BigInt(String(entry.amount_raw))
      } catch {
        continue
      }
      if (entry.entry_type === 'earning' && entry.direction === 'credit') {
        earnedLuna += amount
      }
      if (entry.entry_type === 'payout' && entry.direction === 'debit') {
        withdrawnLuna += amount
      }
    }
  }

  const { data: inFlight } = await supabase
    .from('payouts')
    .select('amount_nim')
    .ilike('host_address', address)
    .eq('status', 'requested')

  const reservedLuna = sumLuna(inFlight, 'amount_nim')

  // Pending = reserved-but-unpaid host earnings on open reservations.
  const { data: spaces } = await supabase
    .from('parking_spaces')
    .select('id')
    .ilike('owner_nimiq_address', address)

  let pendingLuna = 0n
  const spaceIds = (spaces ?? []).map((row) => row.id as string)
  if (spaceIds.length > 0) {
    const { data: reservations } = await supabase
      .from('reservations')
      .select('host_amount_nim')
      .in('parking_space_id', spaceIds)
      .eq('status', 'reservation_pending')

    pendingLuna = sumLuna(reservations, 'host_amount_nim')
  }

  const availableLuna = earnedLuna - withdrawnLuna - reservedLuna
  const toNim = (luna: bigint) => Number(lunaToNim(luna < 0n ? 0n : luna))

  return {
    available: toNim(availableLuna),
    pending: toNim(pendingLuna),
    totalEarned: toNim(earnedLuna),
    totalWithdrawn: toNim(withdrawnLuna),
  }
}
