import { getSupabase } from '@/lib/supabase/client'
import { readFunctionError } from '@/lib/supabase/functions'

/**
 * A Nimiq account's balance.
 *
 * NIM lives on the Nimiq chain, not in the EVM wallet, so this cannot come from
 * `window.ethereum`. The balance is public data, so no auth is needed.
 */

export interface NimBalance {
  address: string
  /** Balance in Luna (1 NIM = 100,000 Luna). */
  balance_luna: number
  exists: boolean
}

export async function fetchNimBalance(address: string): Promise<NimBalance> {
  const supabase = getSupabase()
  const { data, error } = await supabase.functions.invoke('nim-balance', {
    body: { address },
  })

  if (error) {
    throw new Error(await readFunctionError(error, 'Could not load the NIM balance.'))
  }

  const result = data as (NimBalance & { error?: string }) | null
  if (!result || result.error) {
    throw new Error(result?.error ?? 'Could not load the NIM balance.')
  }

  return result
}
