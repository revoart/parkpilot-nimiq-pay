#!/usr/bin/env node
import { readFileSync } from 'node:fs'

import {
  NIMIQ_MAINNET_NETWORK_ID,
  assertTreasuryKeyPair,
  buildSignedPayout,
  deriveKeyPair,
  payoutValidityStartHeight,
} from './lib/treasury.ts'
import { nimToLuna } from '../src/lib/nimiq/amounts.ts'

/**
 * Sends a host payout from the treasury, in NIM, using a local mnemonic.
 *
 * Run by an operator, never by the server: the key stays on this machine and no
 * deployed function can read it.
 *
 *   node --env-file=.env scripts/send-payout.ts <payout_id> [--dry-run] [--resume]
 *
 * The order of operations is the safety property. The transaction is signed and
 * PERSISTED before it is broadcast, because a signed Nimiq transaction is
 * deterministic — same bytes, same hash. If this process dies after
 * broadcasting, `--resume` re-broadcasts the identical bytes instead of signing
 * a fresh transaction and paying twice.
 *
 * Nimiq has no nonce. A transaction is valid from its `validityStartHeight` for
 * 120 blocks (~2 hours), and the network refuses an identical transaction it has
 * already seen, so a re-broadcast is safe by construction.
 */

const POLL_MS = 3_000
const CONFIRM_TIMEOUT_MS = 180_000
/** Nimiq settles fast; two confirmations is a small, real safety margin. */
const CONFIRMATIONS_REQUIRED = 2

interface Config {
  supabaseUrl: string
  rpcEndpoints: string[]
  networkId: number
  treasuryAddress: string
  minPayoutNim: number
  maxPayoutNim: number
}

interface Payout {
  id: string
  host_address: string
  amount_nim: number
  resume?: boolean
  raw_tx?: string | null
  tx_hash?: string | null
}

interface NimiqTransaction {
  hash: string
  confirmations: number
  blockNumber: number
  executionResult: boolean
}

function fail(message: string): never {
  console.error(`\n  x ${message}\n`)
  process.exit(1)
}

function readMnemonic(): string {
  // A file is preferred: it keeps the phrase out of `.env`, which is the file
  // most likely to be copied into a build context or a screenshot.
  const path = process.env.TREASURY_MNEMONIC_FILE?.trim()
  if (path) {
    try {
      const contents = readFileSync(path, 'utf8').trim()
      if (!contents) fail(`TREASURY_MNEMONIC_FILE (${path}) is empty.`)
      return contents
    } catch (error) {
      fail(
        `Could not read TREASURY_MNEMONIC_FILE: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }
  }

  const inline = process.env.TREASURY_MNEMONIC?.trim()
  if (inline) return inline

  fail(
    'No treasury key found. Set TREASURY_MNEMONIC_FILE (a path) or TREASURY_MNEMONIC.',
  )
}

function readSupabaseUrl(): string {
  const url = process.env.VITE_SUPABASE_URL?.trim()
  if (!url) fail('VITE_SUPABASE_URL is not set.')
  return url.replace(/\/$/, '')
}

/* ── Nimiq JSON-RPC ───────────────────────────────────────────────────────── */

let rpcId = 0

/**
 * Call a Nimiq RPC method, trying each endpoint until one answers.
 *
 * Every response is wrapped as `{ result: { data } }`, which is not the shape a
 * conventional JSON-RPC node returns.
 */
async function rpc<T>(
  config: Config,
  method: string,
  params: unknown[] = [],
): Promise<T> {
  let lastError: Error | null = null

  for (const endpoint of config.rpcEndpoints) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
      })

      const payload = (await response.json()) as {
        result?: { data?: T }
        error?: { message?: string; data?: unknown }
      }

      if (payload.error) {
        lastError = new Error(
          `${method}: ${payload.error.message ?? 'error'}`,
        )
        continue
      }

      return (payload.result?.data ?? null) as T
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
    }
  }

  throw lastError ?? new Error(`${method} failed on every endpoint`)
}

async function callFunction<T>(
  config: Config,
  name: string,
  body: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(`${config.supabaseUrl}/functions/v1/${name}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

  const payload = (await response.json().catch(() => null)) as
    | (T & { error?: string })
    | null

  if (!response.ok || !payload) {
    throw new Error(
      `${name} failed (${response.status}): ${payload?.error ?? 'no response'}`,
    )
  }
  if (payload.error) throw new Error(`${name}: ${payload.error}`)

  return payload
}

/**
 * Prove we hold the treasury key, and get a session token.
 *
 * The backend verifies that the public key derives to the address it claims, so
 * this can only ever produce a token for an account we actually control.
 */
async function authenticate(
  config: Config,
  keyPair: ReturnType<typeof deriveKeyPair>,
  address: string,
): Promise<string> {
  const challenge = await callFunction<{
    nonce: string
    issued_at: string
    message: string
  }>(config, 'auth-challenge', { nimiq_address: address })

  // Sign the UTF-8 bytes of the challenge message, which is exactly what the
  // backend verifies.
  const signature = keyPair.sign(new TextEncoder().encode(challenge.message))

  const verified = await callFunction<{ token: string }>(config, 'auth-verify', {
    nimiq_address: address,
    nonce: challenge.nonce,
    issued_at: challenge.issued_at,
    signature: Buffer.from(signature.serialize()).toString('hex'),
    public_key: Buffer.from(keyPair.publicKey.serialize()).toString('hex'),
  })

  return verified.token
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const payoutId = args.find((value) => !value.startsWith('--'))
  const dryRun = args.includes('--dry-run')
  const resume = args.includes('--resume')

  if (!payoutId) {
    fail('Usage: send-payout.ts <payout_id> [--dry-run] [--resume]')
  }

  const supabaseUrl = readSupabaseUrl()
  const mnemonic = readMnemonic()

  // Derive first, so a bad phrase fails before any network call.
  const keyPair = deriveKeyPair(mnemonic)
  const treasuryAddress = keyPair.toAddress().toUserFriendlyAddress()

  const bootstrap: Config = {
    supabaseUrl,
    rpcEndpoints: (process.env.NIMIQ_RPC_ENDPOINTS?.trim() || 'https://rpc.nimiqwatch.com')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean),
    networkId: Number(process.env.NIMIQ_NETWORK_ID ?? NIMIQ_MAINNET_NETWORK_ID),
    treasuryAddress,
    minPayoutNim: 0,
    maxPayoutNim: 0,
  }

  const token = await authenticate(bootstrap, keyPair, treasuryAddress)

  // Everything the signer needs before it touches a key, including the treasury
  // address to check the mnemonic against.
  const remote = await callFunction<{
    treasury_address: string
    network_id: number
    rpc_endpoints: string[]
    min_payout_nim: number
    max_payout_nim: number
  }>(bootstrap, 'payout-config', { auth_token: token })

  const config: Config = {
    ...bootstrap,
    treasuryAddress: remote.treasury_address,
    networkId: remote.network_id,
    rpcEndpoints:
      remote.rpc_endpoints?.length > 0 ? remote.rpc_endpoints : bootstrap.rpcEndpoints,
    minPayoutNim: remote.min_payout_nim,
    maxPayoutNim: remote.max_payout_nim,
  }

  // Fail closed if the key does not belong to the configured treasury. Checking
  // before claiming means a misconfigured signer never takes a payout it cannot
  // legitimately send.
  assertTreasuryKeyPair(keyPair, config.treasuryAddress)

  console.log(`\n  treasury : ${config.treasuryAddress}`)
  console.log(`  network  : ${config.networkId === NIMIQ_MAINNET_NETWORK_ID ? 'mainnet' : config.networkId}`)
  console.log(`  payout   : ${payoutId}${resume ? ' (resume)' : ''}${dryRun ? ' (dry run)' : ''}\n`)

  const claim = await callFunction<Payout>(config, 'begin-payout-send', {
    payout_id: payoutId,
    auth_token: token,
    resume,
  })

  if (claim.resume) {
    console.log(`  resuming a signed send: ${claim.raw_tx?.slice(0, 24)}...`)
  } else {
    console.log(
      `  claimed ${claim.amount_nim} NIM -> ${claim.host_address}`,
    )
  }

  // A payout goes to the host's own Nimiq account — there is no separate payout
  // destination, and no second wallet.
  if (!claim.host_address) {
    fail('The payout has no host account.')
  }

  // Preflight: the treasury must actually hold enough NIM. Nimiq has no gas
  // token, so the balance only has to cover the payout itself.
  const account = await rpc<{ balance: number } | null>(config, 'getAccountByAddress', [
    config.treasuryAddress,
  ])
  const balance = BigInt(account?.balance ?? 0)
  // Exact Luna, never `amount * 100_000` — that is a float on a money value.
  const needed = nimToLuna(String(claim.amount_nim))

  console.log(`  treasury balance: ${balance} Luna (need ${needed})`)

  if (balance < needed) {
    await callFunction(config, 'fail-payout', {
      payout_id: payoutId,
      reason: 'The treasury does not hold enough NIM for this payout.',
      auth_token: token,
    })
    fail('Treasury balance is too low. Nothing was signed or sent.')
  }

  let serialized = claim.raw_tx ?? ''
  let hash = claim.tx_hash ?? ''

  if (!serialized) {
    const head = await rpc<number>(config, 'getBlockNumber', [])
    const signed = buildSignedPayout(keyPair, {
      sender: config.treasuryAddress,
      recipient: claim.host_address,
      amountNim: String(claim.amount_nim),
        validityStartHeight: payoutValidityStartHeight(head),
      networkId: config.networkId,
    })

    serialized = signed.serialized
    hash = signed.hash

    if (dryRun) {
      console.log(`\n  dry run: signed ${serialized.length / 2} bytes, hash ${hash}`)
      console.log('  nothing was persisted or broadcast.\n')
      return
    }

    // Persist BEFORE broadcasting. If this process dies between the two, a
    // retry re-broadcasts these exact bytes rather than signing a new payment.
    await callFunction(config, 'record-payout-send', {
      payout_id: payoutId,
      raw_tx: serialized,
      tx_hash: hash,
      auth_token: token,
    })
    console.log(`  signed and persisted: ${hash}`)
  }

  console.log('  broadcasting...')
  const broadcastHash = await rpc<string>(config, 'sendRawTransaction', [serialized])

  const finalHash = broadcastHash || hash
  console.log(`  broadcast: ${finalHash}`)

  const deadline = Date.now() + CONFIRM_TIMEOUT_MS
  let confirmations = 0

  while (Date.now() < deadline) {
    const tx = await rpc<NimiqTransaction | null>(config, 'getTransactionByHash', [
      finalHash,
    ]).catch(() => null)

    if (tx) {
      confirmations = tx.confirmations ?? 0
      if (!tx.executionResult) {
        await callFunction(config, 'fail-payout', {
          payout_id: payoutId,
          reason: 'The transaction failed on-chain.',
          auth_token: token,
        })
        fail('The payout transaction failed on-chain.')
      }
      if (confirmations >= CONFIRMATIONS_REQUIRED) break
      console.log(`  ${confirmations}/${CONFIRMATIONS_REQUIRED} confirmations...`)
    } else {
      console.log('  waiting for the network to see it...')
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_MS))
  }

  if (confirmations < CONFIRMATIONS_REQUIRED) {
    console.log(
      '\n  Not confirmed within the timeout. The signed transaction is recorded;' +
        '\n  re-run with --resume to check it again. Nothing was lost.\n',
    )
    return
  }

  await callFunction(config, 'mark-payout-paid', {
    payout_id: payoutId,
    tx_hash: finalHash,
    auth_token: token,
  })

  console.log(`\n  paid ${claim.amount_nim} NIM to ${claim.host_address}\n`)
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error))
})
