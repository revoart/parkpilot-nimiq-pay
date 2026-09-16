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
  const result = await nimiq.sign(message)
  if (!result?.publicKey || !result?.signature) {
    throw new Error('Nimiq signing returned an unexpected response.')
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
  const hash = await nimiq.sendBasicTransaction({
    ...transaction,
    recipient: formatNimiqAddress(transaction.recipient),
  })

  if (!hash) throw new Error('Nimiq payment returned no transaction hash.')
  return hash
}
