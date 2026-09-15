import { getAddress, isAddress } from 'viem'

export function isValidAddress(value: unknown): value is string {
  return typeof value === 'string' && isAddress(value)
}

/** Returns the checksummed address, or throws a descriptive error. */
export function assertValidAddress(value: unknown, label: string): string {
  if (!isValidAddress(value)) {
    throw new Error(`Invalid ${label}: not a valid EVM address.`)
  }
  return getAddress(value)
}

export function addressesEqual(a: string, b: string): boolean {
  if (!isValidAddress(a) || !isValidAddress(b)) return false
  return a.toLowerCase() === b.toLowerCase()
}
