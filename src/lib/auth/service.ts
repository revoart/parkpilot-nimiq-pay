import { sendNimiqPayment } from '@/lib/nimiq'
import { readFunctionError } from '@/lib/supabase/functions'
import { getSupabase } from '@/lib/supabase/client'

/**
 * Account authentication.
 *
 * Proof of ownership is a **transfer**, not a signature. Nimiq Pay's `sign()`
 * returns a signature that neither Nimiq's own verifier nor standard Ed25519
 * can validate against the message we sent, so signing is not a usable
 * foundation for authentication.
 *
 * The backend issues a nonce, the wallet sends 1 Luna (0.00001 NIM) to the
 * platform with that nonce attached as transaction data, and the backend
 * confirms it on-chain. **The sender of that transfer is the identity** — only
 * the holder of the private key for an address can move funds from it.
 */
const KEY = 'parkpilot.auth'

/**
 * The account a stored token was issued to.
 *
 * A token is only valid for the account it was issued for. Without recording
 * which account that is, a token left over from an earlier session is reused
 * silently — and every read then runs as the wrong account, which surfaces as
 * data simply not being found rather than as an authentication problem.
 */
const AUTH_ADDRESS_KEY = 'parkpilot.auth.address'

/**
 * The connected account, as verified by the server.
 *
 * Shared with `useWallet`, which reads the same key. The address comes from the
 * transfer that proved ownership, not from `listAccounts()[0]` — those are
 * frequently different accounts, and trusting the wrong one was what made every
 * genuine sign-in fail.
 */
const ADDRESS_KEY = 'parkpilot.nimiq-account'

/** How long to wait for the transfer to confirm before giving up. */
const CONFIRM_TIMEOUT_MS = 120_000
const POLL_INTERVAL_MS = 3_000

/**
 * How long a failed sign-in is remembered.
 *
 * Without this, every write endpoint calls `requireToken`, finds no token, and
 * starts a fresh sign-in — so a failure that is not the user's fault produces a
 * new approval dialog on every screen. Real transfers were paid for and thrown
 * away this way. A short cooldown means one failure costs one dialog.
 */
const FAILURE_COOLDOWN_MS = 30_000

let token: string | null = null
let inFlight: Promise<string> | null = null
let lastFailure: { message: string; declined: boolean; at: number } | null = null

/**
 * A sign-in failure that says what actually went wrong.
 *
 * This used to be swallowed: every error — a failed challenge, a rejected
 * signature, a network fault — became `null`, and callers reported the same
 * generic "sign in with your account" message. The reason is now carried to the
 * surface.
 */
export class SignInError extends Error {
  /** True when the user dismissed the wallet's approval dialog. */
  readonly declined: boolean

  constructor(message: string, declined = false) {
    super(message)
    this.name = 'SignInError'
    this.declined = declined
  }
}

/** Nimiq Pay reports a dismissed approval dialog as a permission error. */
function isDeclined(message: string): boolean {
  return /denied|reject|cancel|permission/i.test(message)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function getAuthToken(): string | null {
  if (token) return token
  try {
    token = sessionStorage.getItem(KEY)
  } catch {
    // ignore
  }
  return token
}

export function clearAuthToken(): void {
  token = null
  lastFailure = null
  try {
    sessionStorage.removeItem(KEY)
    sessionStorage.removeItem(AUTH_ADDRESS_KEY)
  } catch {
    // ignore
  }
}

function store(next: string, address?: string): string {
  token = next
  try {
    sessionStorage.setItem(KEY, next)
    if (address) sessionStorage.setItem(AUTH_ADDRESS_KEY, address)
  } catch {
    // ignore
  }
  return next
}

/** The account the current token belongs to, if one was recorded. */
function tokenAddress(): string | null {
  try {
    return sessionStorage.getItem(AUTH_ADDRESS_KEY)
  } catch {
    return null
  }
}

function sameAccount(a: string, b: string): boolean {
  return a.replace(/\s+/g, '').toLowerCase() === b.replace(/\s+/g, '').toLowerCase()
}

/** Record the verified account so the rest of the app reads the right one. */
function storeAddress(address: string): void {
  try {
    sessionStorage.setItem(ADDRESS_KEY, address)
  } catch {
    // ignore
  }
  // `useWallet` reads this key once on mount. Without a nudge it would keep
  // showing the address the client claimed rather than the one the server
  // verified, which is a different account whenever the wallet's active account
  // is not its first listed one.
  try {
    window.dispatchEvent(
      new CustomEvent('parkpilot:account', { detail: address }),
    )
  } catch {
    // ignore
  }
}

/** The storage key `useWallet` and this module share for the account. */
export const ACCOUNT_STORAGE_KEY = ADDRESS_KEY

interface Challenge {
  nonce: string
  recipient: string
  amount_luna: number
  data: string
}

/**
 * Sign in with the connected Nimiq account.
 *
 * Throws `SignInError` with the real reason. Never resolves to null — a silent
 * null is what made the original failure invisible.
 */
export async function signIn(address: string): Promise<string> {
  if (inFlight) return inFlight

  // A recent failure is reported as-is rather than retried. Each retry costs
  // the user a wallet approval and, when the transfer succeeds but is not
  // accepted, real NIM.
  if (lastFailure && Date.now() - lastFailure.at < FAILURE_COOLDOWN_MS) {
    throw new SignInError(lastFailure.message, lastFailure.declined)
  }

  inFlight = (async () => {
    try {
      const supabase = getSupabase()

      const { data: challenge, error } = await supabase.functions.invoke(
        'auth-challenge',
        { body: { nimiq_address: address } },
      )
      if (error || !challenge) {
        throw new Error(
          await readFunctionError(error, 'Could not start sign-in.'),
        )
      }

      const payload = challenge as Challenge
      if (!payload.nonce || !payload.recipient) {
        throw new Error('The server did not return a sign-in challenge.')
      }

      // The only step that talks to the wallet. A 1 Luna transfer with the
      // nonce attached — this is what proves the account is yours.
      const txHash = await sendNimiqPayment({
        recipient: payload.recipient,
        value: payload.amount_luna,
        data: payload.data,
      })

      const deadline = Date.now() + CONFIRM_TIMEOUT_MS
      while (Date.now() < deadline) {
        await sleep(POLL_INTERVAL_MS)

        const { data: verified, error: verifyError } =
          await supabase.functions.invoke('auth-verify', {
            body: {
              nimiq_address: address,
              nonce: payload.nonce,
              tx_hash: txHash,
            },
          })

        // 401s and the like carry a readable reason — surface it.
        if (verifyError) {
          throw new Error(
            await readFunctionError(verifyError, 'Sign-in failed.'),
          )
        }

        const result = verified as { token?: string; address?: string } | null
        if (result?.token) {
          // Trust the address the server verified, not the one we claimed.
          if (result.address) storeAddress(result.address)
          return store(result.token, result.address)
        }

        // Otherwise the transfer is still pending; keep waiting.
      }

      throw new Error(
        'The transfer was sent but has not confirmed yet. Try again in a moment.',
      )
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : 'Sign-in failed.'

      // A dismissed dialog is a cancellation, not a fault. Saying so lets the
      // user simply try again instead of hunting for a problem that isn't there.
      const declined = isDeclined(message)
      lastFailure = { message, declined, at: Date.now() }

      throw new SignInError(
        declined ? 'Sign-in was cancelled in Nimiq Pay.' : message,
        declined,
      )
    } finally {
      inFlight = null
    }
  })()

  return inFlight
}

/** Token for a write call — re-signs if needed. */
export async function requireToken(address: string): Promise<string> {
  const existing = getAuthToken()
  if (existing) {
    const bound = tokenAddress()
    // No recorded account means a token from before this was tracked. It cannot
    // be trusted to belong to the account now in use, so it is discarded rather
    // than used to read another account's data.
    if (bound && sameAccount(bound, address)) return existing
    clearAuthToken()
  }

  return await signIn(address)
}
