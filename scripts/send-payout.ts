#!/usr/bin/env node
import { readFileSync } from 'node:fs'

import { keccak256 } from 'viem'

import {
  assertNotSelfSend,
  assertTreasuryMatch,
  decimalToRaw,
  deriveTreasuryAccount,
  encodeTransfer,
  explorerTxUrl,
} from './lib/treasury.ts'

/**
 * Sends a host payout from the treasury, using a local mnemonic.
 *
 * Run by an operator, never by the server: the key stays on this machine and
 * no deployed function can read it.
 *
 *   node --env-file=.env scripts/send-payout.ts <payout_id> [--dry-run] [--resume]
 *
 * The order of operations is the safety property. The transaction is signed and
 * PERSISTED before it is broadcast, because a signed transaction is
 * deterministic — same bytes, same hash. If this process dies after
 * broadcasting, `--resume` re-broadcasts the identical bytes instead of signing
 * a fresh transaction and paying twice.
 */

const USDT_DECIMALS = 6
const RECEIPT_TIMEOUT_MS = 120_000
const POLL_MS = 3_000
/** Polygon rejects priority fees below ~25 gwei, so this is a floor, not a cap. */
const MIN_PRIORITY_WEI = 30_000_000_000n

interface Config {
  supabaseUrl: string
  rpcUrl: string
  explorerBase: string
  chainId: number
  usdtContract: `0x${string}`
}

interface TxReceipt {
  status: string
  blockNumber: string
}

function fail(message: string): never {
  console.error(`\n  ✖ ${message}\n`)
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

function readConfig(): Config {
  const supabaseUrl = process.env.VITE_SUPABASE_URL?.trim()
  if (!supabaseUrl) fail('VITE_SUPABASE_URL is not set.')

  return {
    supabaseUrl: supabaseUrl.replace(/\/$/, ''),
    rpcUrl:
      process.env.VITE_POLYGON_RPC_URL?.trim() ??
      'https://polygon-bor-rpc.publicnode.com',
    explorerBase:
      process.env.VITE_BLOCK_EXPLORER_URL?.trim() ?? 'https://polygonscan.com',
    chainId: Number(process.env.VITE_POLYGON_CHAIN_ID_DECIMAL ?? 137),
    usdtContract: (process.env.VITE_USDT_CONTRACT_ADDRESS?.trim() ??
      '0xc2132D05D31c914a87C6611C10748AEb04B58e8F') as `0x${string}`,
  }
}

/* ── JSON-RPC ─────────────────────────────────────────────────────────────── */

let rpcId = 0

async function rpc<T>(config: Config, method: string, params: unknown[]): Promise<T> {
  const response = await fetch(config.rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
  })
  const payload = (await response.json()) as {
    result?: T
    error?: { message?: string }
  }
  if (payload.error) throw new Error(`${method}: ${payload.error.message}`)
  if (payload.result === undefined) throw new Error(`${method}: no result`)
  return payload.result
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
    | { error?: string }
    | null

  if (!response.ok) {
    throw new Error(payload?.error ?? `${name} failed (${response.status})`)
  }
  return payload as T
}

/* ── Sign-in (the same EIP-712 flow the app uses) ─────────────────────────── */

async function signIn(
  config: Config,
  account: ReturnType<typeof deriveTreasuryAccount>,
): Promise<string> {
  const challenge = await callFunction<{
    nonce: string
    issued_at: string
    typed_data: Parameters<typeof account.signTypedData>[0]
  }>(config, 'auth-challenge', { evm_address: account.address })

  const signature = await account.signTypedData(challenge.typed_data)

  const verified = await callFunction<{ token?: string }>(config, 'auth-verify', {
    evm_address: account.address,
    nonce: challenge.nonce,
    issued_at: challenge.issued_at,
    signature,
  })

  if (!verified.token) fail('Sign-in returned no token.')
  return verified.token
}

/* ── Main ─────────────────────────────────────────────────────────────────── */

async function main() {
  const args = process.argv.slice(2)
  const payoutId = args.find((arg) => !arg.startsWith('--'))
  const dryRun = args.includes('--dry-run')

  if (!payoutId || args.includes('--help')) {
    console.log(
      'usage: node --env-file=.env scripts/send-payout.ts <payout_id> [--dry-run] [--resume]',
    )
    process.exit(payoutId ? 0 : 1)
  }

  const config = readConfig()
  const account = deriveTreasuryAccount(readMnemonic())

  console.log(`\n  treasury   ${account.address}`)
  console.log(`  payout     ${payoutId}`)
  console.log(`  mode       ${dryRun ? 'DRY RUN — nothing will be broadcast' : 'live'}\n`)

  const token = await signIn(config, account)
  const auth = { auth_token: token, evm_address: account.address }

  // 1. Confirm the key belongs to the configured treasury BEFORE claiming
  //    anything, so a misconfigured signer never takes a payout it cannot send.
  const platform = await callFunction<{
    treasury_address: string
    payouts_enabled: boolean
    max_payout_usdt: number
    usdt_contract: `0x${string}`
  }>(config, 'payout-config', auth)

  assertTreasuryMatch(account.address, platform.treasury_address)
  console.log(`  ✓ key matches the configured treasury`)

  if (!platform.payouts_enabled) {
    console.log(
      `  ! payouts_enabled is false — the server will refuse to claim.\n`,
    )
  }

  // 2. Claim, or pick up an interrupted send.
  const begin = await callFunction<{
    resume: boolean
    payout: {
      id: string
      payout_address: string
      amount_usdt: number
      host_address: string
    }
    raw_tx?: string
    tx_hash?: string
    send_nonce?: number
  }>(config, 'begin-payout-send', { ...auth, payout_id: payoutId })

  const { payout } = begin
  assertNotSelfSend(payout.payout_address, platform.treasury_address)

  console.log(`  ✓ ${begin.resume ? 'resuming' : 'claimed'} ${payout.amount_usdt} USDT`)
  console.log(`    to ${payout.payout_address}`)

  let serialized = begin.raw_tx as `0x${string}` | undefined
  let hash = begin.tx_hash as `0x${string}` | undefined

  if (!serialized) {
    // 3. Pre-flight: without enough of either asset the send cannot succeed, and
    //    finding out after signing wastes a nonce.
    const amountRaw = decimalToRaw(payout.amount_usdt, USDT_DECIMALS)
    const balanceData = encodeTransferBalance(account.address)

    const balanceHex = await rpc<string>(config, 'eth_call', [
      { to: platform.usdt_contract, data: balanceData },
      'latest',
    ])
    const balance = BigInt(balanceHex)
    if (balance < amountRaw) {
      fail(
        `Treasury holds ${formatRaw(balance)} USDT but this payout is ${payout.amount_usdt} USDT.`,
      )
    }

    const gasPriceHex = await rpc<string>(config, 'eth_gasPrice', [])
    const gasPrice = BigInt(gasPriceHex)
    const priority =
      gasPrice > MIN_PRIORITY_WEI ? gasPrice : MIN_PRIORITY_WEI

    const nonceHex = await rpc<string>(config, 'eth_getTransactionCount', [
      account.address,
      'pending',
    ])
    const nonce = Number(BigInt(nonceHex))

    const data = encodeTransfer(payout.payout_address, amountRaw)

    const gasHex = await rpc<string>(config, 'eth_estimateGas', [
      { from: account.address, to: platform.usdt_contract, data, value: '0x0' },
    ])
    // A 25% margin: estimation runs against current state and can under-report
    // if storage changes between estimate and execution.
    const gas = (BigInt(gasHex) * 125n) / 100n

    const nativeHex = await rpc<string>(config, 'eth_getBalance', [
      account.address,
      'latest',
    ])
    const native = BigInt(nativeHex)
    const maxFeePerGas = gasPrice * 2n
    const worstCase = gas * maxFeePerGas
    if (native < worstCase) {
      fail(
        `Treasury holds ${formatRaw(native, 18)} POL but up to ` +
          `${formatRaw(worstCase, 18)} POL is needed for gas. Top it up.`,
      )
    }

    serialized = await account.signTransaction({
      chainId: config.chainId,
      to: platform.usdt_contract,
      data,
      value: 0n,
      nonce,
      gas,
      maxFeePerGas,
      maxPriorityFeePerGas: priority,
      type: 'eip1559',
    })

    // The hash is derived from the signed bytes, so persisting both means a
    // retry can broadcast the identical transaction rather than a new one.
    hash = keccak256(serialized)
    const sendNonce = nonce

    console.log(`  ✓ signed  ${hash}`)

    if (dryRun) {
      console.log('\n  DRY RUN — stopping before broadcast.\n')
      console.log(`  (the payout is claimed as 'sending' and must be resumed or failed)\n`)
      process.exit(0)
    }

    // 4. Persist BEFORE broadcasting. This is the step that makes retries safe.
    await callFunction(config, 'record-payout-send', {
      ...auth,
      payout_id: payoutId,
      tx_hash: hash,
      raw_tx: serialized,
      send_nonce: sendNonce,
    })
    console.log(`  ✓ persisted before broadcast`)
  } else {
    console.log(`  ✓ resuming stored transaction ${hash}`)
    if (dryRun) {
      console.log('\n  DRY RUN — nothing broadcast.\n')
      process.exit(0)
    }
  }

  // Both branches above must have produced a signed transaction; if not, the
  // server gave us an inconsistent state and broadcasting is not safe.
  if (!serialized || !hash) {
    fail('No signed transaction to broadcast. Nothing was sent.')
  }

  // 5. Broadcast. Safe to repeat: identical bytes, identical hash.
  try {
    await rpc<string>(config, 'eth_sendRawTransaction', [serialized])
    console.log(`  ✓ broadcast`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    // "already known" / "nonce too low" mean it is already on chain, which is a
    // success for our purposes — do not treat a re-broadcast as a failure.
    if (!/already known|nonce too low|already imported/i.test(message)) {
      await callFunction(config, 'fail-payout', {
        ...auth,
        payout_id: payoutId,
        reason: `Broadcast failed: ${message}`.slice(0, 300),
      })
      fail(`Broadcast failed and the payout was marked failed: ${message}`)
    }
    console.log(`  ✓ already on chain`)
  }

  // 6. Wait for the receipt, then let the server verify and settle it.
  const deadline = Date.now() + RECEIPT_TIMEOUT_MS
  let receipt: TxReceipt | null = null

  while (Date.now() < deadline) {
    receipt = await rpc<TxReceipt | null>(config, 'eth_getTransactionReceipt', [hash])
    if (receipt) break
    await new Promise((resolve) => setTimeout(resolve, POLL_MS))
  }

  if (!receipt) {
    console.log(
      `\n  ! not mined within ${RECEIPT_TIMEOUT_MS / 1000}s. It is recorded as` +
        `\n    'sending' with its signed bytes, so re-run with --resume later.\n`,
    )
    process.exit(1)
  }

  if (receipt.status !== '0x1') {
    await callFunction(config, 'fail-payout', {
      ...auth,
      payout_id: payoutId,
      reason: `Transaction reverted on chain (${hash})`,
    })
    fail(`The transaction reverted: ${explorerTxUrl(config.explorerBase, hash)}`)
  }

  // mark-payout-paid re-verifies the transfer on chain before settling, so a
  // bug here cannot mark a payout paid without the money having moved.
  await callFunction(config, 'mark-payout-paid', {
    ...auth,
    payout_id: payoutId,
    tx_hash: hash,
  })

  console.log(`  ✓ settled on chain`)
  console.log(`\n  ${explorerTxUrl(config.explorerBase, hash)}\n`)
}

/** `balanceOf(address)` selector + padded argument. */
function encodeTransferBalance(owner: string): `0x${string}` {
  const selector = '0x70a08231'
  return `${selector}${owner.toLowerCase().replace(/^0x/, '').padStart(64, '0')}`
}

function formatRaw(value: bigint, decimals = USDT_DECIMALS): string {
  const base = 10n ** BigInt(decimals)
  const whole = value / base
  const fraction = (value % base).toString().padStart(decimals, '0').replace(/0+$/, '')
  return fraction ? `${whole}.${fraction}` : `${whole}`
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error))
})
