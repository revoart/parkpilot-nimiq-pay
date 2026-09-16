import { errorResponse, json, preflight } from '../_shared/http.ts'
import { getNimiqAccount, isValidNimiqAddress } from '../_shared/nimiq.ts'

/**
 * A Nimiq account's balance, in Luna.
 *
 * NIM lives on the Nimiq chain, not in the EVM wallet, so the balance cannot be
 * read from `window.ethereum`. Public data, so no auth: an address balance is
 * visible to anyone on a block explorer.
 */
Deno.serve(async (request) => {
  const options = preflight(request)
  if (options) return options
  if (request.method !== 'POST') {
    return errorResponse(request, 'Method not allowed', 405)
  }

  try {
    const body = (await request.json().catch(() => null)) as {
      address?: string
    } | null
    if (!body) return errorResponse(request, 'Invalid JSON body.')

    if (!isValidNimiqAddress(body.address)) {
      return errorResponse(request, 'Invalid Nimiq address.')
    }

    const account = await getNimiqAccount(body.address)

    // An address with no on-chain state has never received anything, which is a
    // balance of zero rather than an error.
    return json(request, {
      address: body.address,
      balance_luna: account?.balance ?? 0,
      exists: account !== null,
    })
  } catch (error) {
    console.error('nim-balance failed', error)
    return errorResponse(
      request,
      error instanceof Error ? error.message : 'Unexpected error',
      500,
    )
  }
})
