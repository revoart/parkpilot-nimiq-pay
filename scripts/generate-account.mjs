import { existsSync, writeFileSync } from 'node:fs'

import { KeyPair, MnemonicUtils } from '@nimiq/core'

/**
 * Generate a Nimiq account and write its mnemonic to a file outside the repo.
 *
 *   node scripts/generate-account.mjs <mnemonic-output-path>
 *
 * Only the address is printed. The mnemonic is the key to whatever the account
 * holds and must never reach a transcript, a log, or version control — which is
 * exactly why the existing treasury key needs rotating: it was read into this
 * session's transcript when the Supabase secret was set.
 *
 * Refuses to overwrite an existing key file, so a moment's inattention cannot
 * destroy the only copy of a key.
 */

const FILE = process.argv[2]
if (!FILE) {
  console.error('Usage: generate-account.mjs <mnemonic-output-path>')
  process.exit(1)
}
if (existsSync(FILE)) {
  console.error(`Refusing to overwrite an existing key file: ${FILE}`)
  process.exit(1)
}

function deriveAddress(words) {
  return KeyPair.derive(
    MnemonicUtils.mnemonicToEntropy(words).toExtendedPrivateKey().privateKey,
  )
    .toAddress()
    .toUserFriendlyAddress()
}

// 32 bytes of entropy gives the 24 words Nimiq derives from.
const entropy = new Uint8Array(32)
crypto.getRandomValues(entropy)
const words = MnemonicUtils.entropyToMnemonic(entropy)
const mnemonic = words.join(' ')

const address = deriveAddress(words)

// Round-trip from the exact text being written, so a formatting mistake can
// never produce a file whose words open a different account.
if (deriveAddress(mnemonic.split(/\s+/)) !== address) {
  throw new Error('Mnemonic did not round-trip to the same address.')
}

writeFileSync(FILE, `${mnemonic}\n`, { encoding: 'utf8', mode: 0o600 })

console.log('word count :', words.length)
console.log('round trip : ok')
console.log('ADDRESS    :', address)
console.log('key file   :', FILE)
