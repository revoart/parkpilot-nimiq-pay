import {
  Address,
  KeyPair,
  MnemonicUtils,
  TransactionBuilder,
  type Transaction,
} from '@nimiq/core'

// The pure Nimiq helpers are shared with the app rather than duplicated. These
// two modules deliberately have no dependency on the mini app SDK, so importing
// them here does not drag the wallet SDK into the operator script.
import { LUNA_PER_NIM, nimToLuna } from '../../src/lib/nimiq/amounts'
import { isValidNimiqAddress } from '../../src/lib/nimiq/address'

/**
 * Treasury key handling for the payout signer.
 *
 * Everything here runs locally. The key never leaves this process, is never
 * sent anywhere, and the signed transaction is persisted before it is
 * broadcast, so a crash in between re-broadcasts identical bytes rather than
 * signing a fresh transaction and paying twice.
 *
 * Nimiq keys are Ed25519 and derive from a BIP-39 mnemonic through Nimiq's own
 * path, which is NOT the same as an Ethereum key — an EVM mnemonic will produce
 * a different address here, and the assertion below is what catches that.
 */

/** Nimiq Albatross mainnet. The old Proof-of-Work network used 42. */
export const NIMIQ_MAINNET_NETWORK_ID = 24
export const NIMIQ_TESTNET_NETWORK_ID = 5

/**
 * Derive the treasury key pair from a BIP-39 mnemonic.
 *
 * Nimiq's entropy is 256 bits, so its mnemonics are **24 words**. A 12-word
 * phrase cannot produce a Nimiq account at all — the primitive rejects it — and
 * a mnemonic that happens to be 24 words but was generated for Ethereum will
 * derive a different address, which `assertTreasuryKeyPair` catches.
 */
export function deriveKeyPair(mnemonic: string): KeyPair {
  const words = mnemonic.trim().split(/\s+/).filter(Boolean)

  if (words.length !== 24) {
    throw new Error(
      `A Nimiq treasury mnemonic must be 24 words (Nimiq entropy is 256 bits), got ${words.length}.`,
    )
  }

  const entropy = MnemonicUtils.mnemonicToEntropy(words)
  const extended = entropy.toExtendedPrivateKey()
  return KeyPair.derive(extended.privateKey)
}

/** The user-friendly address for a mnemonic, without signing anything. */
export function addressFromMnemonic(mnemonic: string): string {
  return deriveKeyPair(mnemonic).toAddress().toUserFriendlyAddress()
}

/**
 * Compare addresses the way Nimiq means them: case- and space-insensitive.
 */
export function addressesMatch(a: string, b: string): boolean {
  return normalize(a) === normalize(b)
}

function normalize(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase()
}

/**
 * Refuse to sign if the mnemonic does not belong to the configured treasury.
 *
 * This is the guard that stops a misconfigured signer from sending funds from
 * an account nobody expected — and, just as importantly, from a mnemonic that
 * derives to a *different* network's address than the one the database holds.
 */
export function assertTreasuryKeyPair(keyPair: KeyPair, expected: string): void {
  if (!isValidNimiqAddress(expected)) {
    throw new Error('The configured treasury address is not a valid Nimiq address.')
  }

  const derived = keyPair.toAddress().toUserFriendlyAddress()
  if (!addressesMatch(derived, expected)) {
    throw new Error(
      `Treasury key mismatch: the mnemonic derives to ${derived}, but the ` +
        `platform is configured for ${expected}. Refusing to sign.`,
    )
  }
}

/** Refuse to pay the treasury out of the treasury. */
export function assertNotSelfSend(sender: string, recipient: string): void {
  if (addressesMatch(sender, recipient)) {
    throw new Error('Refusing to send a payout to the treasury itself.')
  }
}

export interface BuildPayoutTransactionInput {
  sender: string
  recipient: string
  /** Amount in NIM, as the decimal string the database returns. */
  amountNim: string
  feeLuna?: bigint
  validityStartHeight: number
  networkId?: number
}

/**
 * Build and sign a payout transaction, returning the serialized bytes.
 *
 * Nothing is broadcast here: the caller persists the serialized transaction
 * first, then sends it. `serialize()` is deliberately used instead of the
 * client's `sendTransaction`, which would sign and send in one step and leave
 * no chance to record the intent.
 */
export function buildSignedPayout(
  keyPair: KeyPair,
  input: BuildPayoutTransactionInput,
): { serialized: string; hash: string } {
  const sender = Address.fromUserFriendlyAddress(input.sender)
  const recipient = Address.fromUserFriendlyAddress(input.recipient)

  assertNotSelfSend(input.sender, input.recipient)

  const value = nimToLuna(input.amountNim)
  if (value <= 0n) {
    throw new Error('A payout must be greater than zero NIM.')
  }

  const transaction: Transaction = TransactionBuilder.newBasic(
    sender,
    recipient,
    value,
    input.feeLuna ?? 0n,
    input.validityStartHeight,
    input.networkId ?? NIMIQ_MAINNET_NETWORK_ID,
  )

  // The second argument is the "inner" key pair, used only for staking
  // transactions; a basic payment signs with the sender's own key.
  transaction.sign(keyPair, undefined)

  const serialized = transaction.toHex()
  if (!serialized) {
    throw new Error('Failed to serialize the payout transaction.')
  }

  // `hash()` already returns hex, and the hash covers the unsigned content —
  // which is exactly what identifies a re-broadcast of the same bytes.
  return { serialized, hash: transaction.hash() }
}

export { LUNA_PER_NIM }
