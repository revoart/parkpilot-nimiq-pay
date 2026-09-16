import { env } from './env'

/**
 * Nimiq block explorer links.
 *
 * Nimiq addresses a transaction by fragment rather than path, so this is
 * `#<hash>` and not `/tx/<hash>`.
 */
export function explorerTxUrl(txHash: string): string {
  return `${env.blockExplorerUrl}/#${txHash}`
}

export function explorerAddressUrl(address: string): string {
  return `${env.blockExplorerUrl}/#${address}`
}
