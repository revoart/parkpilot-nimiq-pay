import { signTypedData } from '@/lib/ethereum/provider'
import { readFunctionError } from '@/lib/supabase/functions'
import { getSupabase } from '@/lib/supabase/client'

/**
 * Wallet authentication.
 *
 * The app signs a one-time EIP-712 challenge; the backend verifies it and
 * returns a short-lived session token. Write endpoints derive the acting
 * wallet from that token, so the app can only act as a wallet it controls.
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

/** Sign in with the connected wallet. Returns null if the user declines. */
export async function signIn(address: string): Promise<string | null> {
  if (inFlight) return inFlight

  inFlight = (async () => {
    try {
      const supabase = getSupabase()

      const { data: challenge, error } = await supabase.functions.invoke(
        'auth-challenge',
        { body: { evm_address: address } },
      )
      if (error || !challenge) {
        throw new Error(
          await readFunctionError(error, 'Could not start wallet sign-in.'),
        )
      }

      const payload = challenge as {
        nonce: string
        issued_at: string
        typed_data: unknown
      }

      const signature = await signTypedData(address, payload.typed_data)

      const { data: verified, error: verifyError } =
        await supabase.functions.invoke('auth-verify', {
          body: {
            evm_address: address,
            nonce: payload.nonce,
            issued_at: payload.issued_at,
            signature,
          },
        })

      if (verifyError || !verified) {
        throw new Error(
          await readFunctionError(verifyError, 'Wallet sign-in failed.'),
        )
      }

      const next = (verified as { token?: string }).token
      if (!next) throw new Error('Wallet sign-in failed.')

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
  if (!fresh) throw new Error('Sign in with your wallet to continue.')
  return fresh
}
