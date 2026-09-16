import { encodeFunctionData } from 'viem'
import { mnemonicToAccount } from 'viem/accounts'

/**
 * Pure helpers for the treasury signer.
 *
 * Kept separate from the script so they can be tested without a key, a network
 * or a database. Nothing here reads the environment or touches a secret.
 */

/**
 * The default BIP-44 path for the first Ethereum account.
 *
 * Typed as a template literal because that is what viem requires — a plain
 * `string` is rejected, which is useful: it stops a typo'd path being passed.
 */
export const DEFAULT_DERIVATION_PATH: `m/44'/60'/${string}` = "m/44'/60'/0'/0/0"

const ERC20_TRANSFER_ABI = [
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const

/**
 * Normalise a phrase before deriving from it.
 *
 * Users paste phrases with line breaks, stray numbering and double spaces. A
 * BIP-39 phrase is whitespace-separated words, so collapsing all whitespace to
 * single spaces is both correct and the difference between working and a
 * confusing "invalid mnemonic" error.
 */
export function normalizeMnemonic(input: string): string {
  return input.trim().split(/\s+/).join(' ')
}

export function deriveTreasuryAccount(
  mnemonic: string,
  path: `m/44'/60'/${string}` = DEFAULT_DERIVATION_PATH,
) {
  return mnemonicToAccount(normalizeMnemonic(mnemonic), { path })
}

/**
 * Refuse to operate if the key does not belong to the configured treasury.
 *
 * The single most valuable check in the flow: a wrong mnemonic, a wrong
 * derivation path or a stale config would otherwise send real funds from a
 * wallet nobody expected. It runs before anything is claimed, so a
 * misconfigured signer never takes a payout it cannot send.
 */
export function assertTreasuryMatch(derived: string, configured: string): void {
  if (derived.toLowerCase() === configured.toLowerCase()) return

  throw new Error(
    [
      'Refusing to send: the mnemonic does not match the treasury.',
      `  derived from the mnemonic : ${derived}`,
      `  configured treasury       : ${configured}`,
      'Check the phrase, the derivation path, and platform_settings.treasury_address.',
    ].join('\n'),
  )
}

/** Decimal string -> raw integer units, without floating point. */
export function decimalToRaw(value: string | number, decimals: number): bigint {
  const text = String(value).trim()
  if (!/^\d+(\.\d+)?$/.test(text)) {
    throw new Error(`Invalid decimal amount: ${text}`)
  }
  const [whole, fraction = ''] = text.split('.')
  const padded = (fraction + '0'.repeat(decimals)).slice(0, decimals)
  return BigInt(`${whole}${padded}`)
}

/** ABI-encode an ERC-20 `transfer(address,uint256)` call. */
export function encodeTransfer(to: string, amountRaw: bigint): `0x${string}` {
  return encodeFunctionData({
    abi: ERC20_TRANSFER_ABI,
    functionName: 'transfer',
    args: [to as `0x${string}`, amountRaw],
  })
}

/**
 * A payout address must never be the treasury itself.
 *
 * Sending to yourself burns gas and records a payout as settled while the
 * money never left, which corrupts the ledger.
 */
export function assertNotSelfSend(payoutAddress: string, treasury: string): void {
  if (payoutAddress.toLowerCase() !== treasury.toLowerCase()) return
  throw new Error(
    `Refusing to send: the payout address is the treasury itself (${treasury}).`,
  )
}

export function explorerTxUrl(base: string, hash: string): string {
  return `${base.replace(/\/$/, '')}/tx/${hash}`
}
