import { init } from '@nimiq/mini-app-sdk'

export interface NimiqSignResult {
  publicKey: string
  signature: string
}

export interface NimiqProvider {
  listAccounts: () => Promise<string[]>
  sign: (message: string) => Promise<NimiqSignResult>
  isConsensusEstablished: () => Promise<boolean>
  getBlockNumber: () => Promise<number>
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
