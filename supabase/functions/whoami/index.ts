import { readToken, verifyToken } from '../_shared/auth.ts'
import { errorResponse, json, preflight } from '../_shared/http.ts'

/**
 * Returns the account the caller is authenticated as.
 *
 * Every confusing bug in this app has had the same shape: the data was correct
 * but the request was running as a different account than the user believed.
 * Sign-in, the parking pass, "My spaces" and host bookings all failed this way,
 * and each time the symptom was an empty result or "not found" rather than
 * anything that named the identity mismatch.
 *
 * The session token is bound to one address. This endpoint states which, so the
 * app can show it and so a mismatch can be diagnosed in a single call instead of
 * being inferred from absent rows.
 */
Deno.serve(async (request) => {
  const options = preflight(request)
  if (options) return options
  if (request.method !== 'POST') {
    return errorResponse(request, 'Method not allowed', 405)
  }

  try {
    const body = await request.json().catch(() => null)
    const address = await verifyToken(readToken(request, body))

    if (!address) {
      return errorResponse(
        request,
        'Sign in with your account to continue.',
        401,
      )
    }

    return json(request, { address })
  } catch (error) {
    console.error('whoami failed', error)
    return errorResponse(
      request,
      error instanceof Error ? error.message : 'Unexpected error',
      500,
    )
  }
})
