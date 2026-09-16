import { signWithNimiq } from '@/lib/nimiq'
import { readFunctionError } from '@/lib/supabase/functions'
import { getSupabase } from '@/lib/supabase/client'

/**
 * Account authentication.
 *
 * The app asks the backend for a one-time challenge, Nimiq Pay signs it, and the
 * backend verifies the signature and returns a short-lived session token. Write
 * endpoints derive the acting account from that token, so the app can only act
 * as an account it controls.
 *
 * The challenge is a plain readable message rather than EIP-712 structured data,
 * because that is what Nimiq Pay's `sign()` takes — and the approval dialog shows
 * it to the user verbatim.
 */
const KEY = 'parkpilot.auth'

let token: string | null = null
let inFlight: Promise<string | null> | null = null

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
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}

/** Sign in with the connected Nimiq account. Returns null if declined. */
export async function signIn(address: string): Promise<string | null> {
  if (inFlight) return inFlight

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

      const payload = challenge as {
        nonce: string
        issued_at: string
        message: string
      }

      const signed = await signWithNimiq(payload.message)

      const { data: verified, error: verifyError } =
        await supabase.functions.invoke('auth-verify', {
          body: {
            nimiq_address: address,
            nonce: payload.nonce,
            issued_at: payload.issued_at,
            signature: signed.signature,
            public_key: signed.publicKey,
          },
        })

      if (verifyError || !verified) {
        throw new Error(
          await readFunctionError(verifyError, 'Sign-in failed.'),
        )
      }

      const next = (verified as { token?: string }).token
      if (!next) throw new Error('Sign-in failed.')

      token = next
      try {
        sessionStorage.setItem(KEY, next)
      } catch {
        // ignore
      }
      return next
    } catch {
      return null
    } finally {
      inFlight = null
    }
  })()

  return inFlight
}

/** Token for a write call — re-signs if needed. */
export async function requireToken(address: string): Promise<string> {
  const existing = getAuthToken()
  if (existing) return existing

  const fresh = await signIn(address)
  if (!fresh) throw new Error('Sign in with your account to continue.')
  return fresh
}
