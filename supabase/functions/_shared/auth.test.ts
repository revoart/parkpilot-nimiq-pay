import { ed25519 } from '@noble/curves/ed25519'
import { blake2b } from '@noble/hashes/blake2b'
import { KeyPair } from '@nimiq/core'
import { describe, expect, it } from 'vitest'

import { buildAuthMessage, nimiqIdentity, verifyAuthSignature } from './auth.ts'
import { nimiqAddressFromDigest } from './nimiq.ts'

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

/**
 * The server must derive the same address Nimiq derives for a public key.
 *
 * If it does not, `verifyAuthSignature` returns false before it ever compares a
 * signature — which is exactly what made every genuine wallet signature fail
 * while the challenge had been issued and the user had approved the dialog.
 */
describe('address binding', () => {
  it('derives the same address Nimiq derives from a public key', () => {
    const keyPair = KeyPair.generate()
    const publicKey = fromHex(keyPair.publicKey.toHex())

    const derived = nimiqAddressFromDigest(blake2b(publicKey, { dkLen: 32 }))
    const claimed = keyPair.toAddress().toUserFriendlyAddress()

    console.log('server derived :', derived)
    console.log('nimiq claimed  :', claimed)
    console.log('publicKey hex  :', keyPair.publicKey.toHex())
    console.log('publicKey len  :', keyPair.publicKey.toHex().length)

    expect(nimiqIdentity(derived)).toBe(nimiqIdentity(claimed))
  })

  it('derives a valid address for a known public key', () => {
    // Address of the all-0x11 public key, pinned in the address tests.
    const publicKey = new Uint8Array(32).fill(0x11)
    const derived = nimiqAddressFromDigest(blake2b(publicKey, { dkLen: 32 }))
    console.log('all-0x11       :', derived)
    expect(derived.startsWith('NQ')).toBe(true)
  })
})

describe('signature verification', () => {
  it('accepts a raw Ed25519 signature over the exact message', async () => {
    const privateKey = ed25519.utils.randomPrivateKey()
    const publicKey = ed25519.getPublicKey(privateKey)
    const address = nimiqAddressFromDigest(blake2b(publicKey, { dkLen: 32 }))

    const message = {
      address,
      nonce: '0123456789abcdef0123456789abcdef',
      issuedAt: '2026-01-01T00:00:00.000Z',
    }

    const signature = ed25519.sign(
      new TextEncoder().encode(buildAuthMessage(message)),
      privateKey,
    )

    const ok = await verifyAuthSignature(
      message,
      toHex(signature),
      toHex(publicKey),
    )
    expect(ok).toBe(true)
  })

  it('rejects a signature from a different key claiming the address', async () => {
    const victim = ed25519.utils.randomPrivateKey()
    const victimAddress = nimiqAddressFromDigest(
      blake2b(ed25519.getPublicKey(victim), { dkLen: 32 }),
    )

    const attacker = ed25519.utils.randomPrivateKey()
    const attackerPublic = ed25519.getPublicKey(attacker)

    const message = {
      address: victimAddress,
      nonce: '0123456789abcdef0123456789abcdef',
      issuedAt: '2026-01-01T00:00:00.000Z',
    }

    const signature = ed25519.sign(
      new TextEncoder().encode(buildAuthMessage(message)),
      attacker,
    )

    const ok = await verifyAuthSignature(
      message,
      toHex(signature),
      toHex(attackerPublic),
    )
    expect(ok).toBe(false)
  })

  /**
   * OPEN ISSUE — not yet passing.
   *
   * A signature from `@nimiq/core`'s `KeyPair.sign()` does not verify against
   * `verifyAuthSignature`, and neither does it verify under `@nimiq/core`'s own
   * `PublicKey.verify()` when called from this harness. The second part is the
   * important clue: the harness is wrong somewhere, not merely the encoding, so
   * the conclusion "Nimiq uses a non-standard signature" is NOT established.
   *
   * What IS established: the address binding below is correct, raw Ed25519
   * signatures verify, and impersonation is rejected. The gap is specifically
   * how Nimiq Pay frames the message it signs.
   *
   * Skipped rather than deleted so the gap stays visible.
   */
  it.skip('accepts a signature produced by Nimiq for its own key', () => {
    // See the note above. Re-enable once the signing call is confirmed against
    // a real Nimiq Pay signature from a device.
  })
})
