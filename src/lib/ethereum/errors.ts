export interface Eip1193ErrorShape {
  code?: number
  message?: string
  data?: unknown
}

export const USER_REJECTED_CODE = 4001
export const CHAIN_NOT_ADDED_CODE = 4902
export const PROVIDER_UNAVAILABLE_CODE = -1

export class ProviderError extends Error {
  readonly code?: number
  readonly cause?: unknown

  constructor(message: string, code?: number, cause?: unknown) {
    super(message)
    this.name = 'ProviderError'
    this.code = code
    this.cause = cause
  }
}

export function toProviderError(error: unknown): ProviderError {
  if (error instanceof ProviderError) return error

  if (typeof error === 'object' && error !== null) {
    const candidate = error as Eip1193ErrorShape
    if (typeof candidate.code === 'number' || candidate.message) {
      return new ProviderError(
        candidate.message ?? 'Wallet request failed.',
        candidate.code,
        error,
      )
    }
  }

  if (error instanceof Error) {
    return new ProviderError(error.message, undefined, error)
  }

  return new ProviderError(String(error), undefined, error)
}

export function isUserRejection(error: unknown): boolean {
  const providerError = toProviderError(error)
  return (
    providerError.code === USER_REJECTED_CODE ||
    /user (rejected|denied|cancell?ed)/i.test(providerError.message)
  )
}

export function userFacingWalletError(error: unknown): string {
  const providerError = toProviderError(error)

  if (providerError.code === PROVIDER_UNAVAILABLE_CODE) {
    return 'Open ParkPilot inside Nimiq Pay to connect your wallet.'
  }
  if (providerError.code === USER_REJECTED_CODE) {
    return 'Request cancelled.'
  }
  if (providerError.code === CHAIN_NOT_ADDED_CODE) {
    return 'Polygon is not available in your wallet.'
  }
  return providerError.message
}
