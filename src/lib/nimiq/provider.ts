import { init } from '@nimiq/mini-app-sdk'

import { formatNimiqAddress, isValidNimiqAddress } from './address'

export interface NimiqSignResult {
  publicKey: string
  signature: string
}

export interface NimiqBasicTransaction {
  /** Nimiq user-friendly address. */
  recipient: string
  /** Amount in Luna (1 NIM = 100,000 Luna). */
  value: number
  /**
   * Text to attach to the transaction. Used to bind a sign-in challenge to a
   * specific transfer. Nimiq caps transaction data at 64 bytes.
   */
  data?: string
  /** Fee in Luna. Omitted lets Nimiq Pay choose, using 0 when possible. */
  fee?: number
  validityStartHeight?: number
}

export interface NimiqProvider {
  listAccounts: () => Promise<string[]>
  sign: (message: string) => Promise<NimiqSignResult>
  isConsensusEstablished: () => Promise<boolean>
  getBlockNumber: () => Promise<number>
  sendBasicTransaction: (transaction: NimiqBasicTransaction) => Promise<string>
  sendBasicTransactionWithData: (
    transaction: NimiqBasicTransaction & { data: string },
  ) => Promise<string>
}

let nimiqPromise: Promise<NimiqProvider> | null = null

/**
 * Nimiq Pay injects `window.nimiqPay` before page scripts run. Its presence is
 * the most reliable signal that the app is running inside the wallet.
 */
export function isInsideNimiqPay(): boolean {
  return typeof window !== 'undefined' && typeof window.nimiqPay !== 'undefined'
}

export function getNimiqPayLanguage(): string {
  if (typeof window === 'undefined') return 'en'
  return window.nimiqPay?.language ?? navigator.language.split('-')[0] ?? 'en'
}

/**
 * Initialize the Nimiq provider. Safe to call multiple times — the underlying
 * promise is cached. Throws if the app is not running inside Nimiq Pay.
 */
export async function initNimiq(timeout = 10_000): Promise<NimiqProvider> {
  if (!nimiqPromise) {
    nimiqPromise = init({ timeout }) as unknown as Promise<NimiqProvider>
  }
  return nimiqPromise
}

export function resetNimiq(): void {
  nimiqPromise = null
}

export async function listNimiqAccounts(): Promise<string[]> {
  const nimiq = await initNimiq()
  const accounts = await nimiq.listAccounts()
  return accounts ?? []
}

export async function signWithNimiq(message: string): Promise<NimiqSignResult> {
  const nimiq = await initNimiq()

  // Named explicitly so a wallet-side failure is never mistaken for a backend
  // one. `sign()` is the only step that opens an approval dialog, so when it
  // throws, the user either dismissed that dialog or the wallet rejected the
  // message itself — both worth saying out loud.
  let result: NimiqSignResult
  try {
    result = await nimiq.sign(message)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`Nimiq Pay could not sign the message: ${reason}`)
  }

  if (!result?.publicKey || !result?.signature) {
    throw new Error('Nimiq Pay returned no signature.')
  }
  return result
}

/** Whether the wallet has established network consensus. No confirmation. */
export async function hasNimiqConsensus(): Promise<boolean> {
  const nimiq = await initNimiq()
  return Boolean(await nimiq.isConsensusEstablished())
}

/** Current block height. No confirmation. */
export async function getNimiqBlockNumber(): Promise<number> {
  const nimiq = await initNimiq()
  return await nimiq.getBlockNumber()
}

/**
 * Send a NIM payment. Requires user confirmation in the wallet.
 *
 * The recipient and amount are validated here so a malformed address or a
 * sub-Luna amount never reaches the approval dialog.
 */
export async function sendNimiqPayment(
  transaction: NimiqBasicTransaction,
): Promise<string> {
  if (!isValidNimiqAddress(transaction.recipient)) {
    throw new Error('Invalid recipient: not a valid Nimiq address.')
  }
  if (!Number.isInteger(transaction.value) || transaction.value <= 0) {
    throw new Error('Invalid amount: NIM payments must be a positive whole number of Luna.')
  }

  const nimiq = await initNimiq()

  const recipient = formatNimiqAddress(transaction.recipient)
  const hash = transaction.data
    ? await nimiq.sendBasicTransactionWithData({
        ...transaction,
        recipient,
        data: transaction.data,
      })
    : await nimiq.sendBasicTransaction({ ...transaction, recipient })

  if (!hash) throw new Error('Nimiq payment returned no transaction hash.')
  return hash
}
