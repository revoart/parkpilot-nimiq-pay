import { readFileSync } from 'node:fs'

import {
  addressFromMnemonic,
  assertTreasuryKeyPair,
  buildSignedPayout,
  deriveKeyPair,
  payoutValidityStartHeight,
} from './lib/treasury.ts'

/**
 * Forward NIM from the escrow to any address.
 *
 *   node scripts/forward-payment.ts <recipient> <amountNim> [--dry-run]
 *
 * Used to pay a host their 90% and to send the platform's 10% to the fee
 * wallet. Uses `payoutValidityStartHeight`, which is what makes a platform
 * transfer execute at all — a validityStartHeight at the chain head fails with
 * `executionResult: false` no matter how large the balance is.
 */

const RPC = 'https://rpc.nimiqwatch.com'

async function rpc(method, params) {
  const response = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }),
  })
  return await response.json()
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const [recipient, amountNim] = args.filter((value) => !value.startsWith('--'))

if (!recipient || !amountNim) {
  console.error('Usage: forward-payment.ts <recipient> <amountNim> [--dry-run]')
  process.exit(1)
}

const file = process.env.TREASURY_MNEMONIC_FILE
if (!file) throw new Error('TREASURY_MNEMONIC_FILE is not set.')

const mnemonic = readFileSync(file, 'utf8').trim()
const keyPair = deriveKeyPair(mnemonic)
const sender = addressFromMnemonic(mnemonic)
assertTreasuryKeyPair(keyPair, sender)

const head = await rpc('getBlockNumber', []).then((r) => r.result.data)
const validityStartHeight = payoutValidityStartHeight(head)

const { serialized, hash } = buildSignedPayout(keyPair, {
  sender,
  recipient,
  amountNim,
  validityStartHeight,
})

console.log('from     :', sender)
console.log('to       :', recipient)
console.log('amount   :', amountNim, 'NIM')
console.log('validity :', validityStartHeight, '| head', head)
console.log('tx hash  :', hash)

if (dryRun) {
  console.log('\nDRY RUN — nothing broadcast.')
  process.exit(0)
}

const sent = await rpc('sendRawTransaction', [serialized])
console.log('broadcast:', JSON.stringify(sent?.result?.data ?? sent?.error ?? sent))

// A broadcast only means the node accepted it. Judge the transfer on its own
// result, never on the response.
for (let i = 0; i < 30; i++) {
  await sleep(15000)
  const tx = await rpc('getTransactionByHash', [hash]).then((r) => r.result?.data)
  if (!tx) continue
  console.log('block    :', tx.blockNumber, '| conf', tx.confirmations)
  console.log('EXECUTED :', tx.executionResult)
  console.log(tx.executionResult ? 'RESULT=PAID' : 'RESULT=FAILED')
  console.log('TX_HASH=' + hash)
  process.exit(0)
}
console.log('RESULT=UNCONFIRMED')
console.log('TX_HASH=' + hash)
