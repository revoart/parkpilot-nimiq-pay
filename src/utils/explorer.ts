import { env } from './env'

export function explorerTxUrl(txHash: string): string {
  return `${env.blockExplorerUrl}/tx/${txHash}`
}

export function explorerAddressUrl(address: string): string {
  return `${env.blockExplorerUrl}/address/${address}`
}
