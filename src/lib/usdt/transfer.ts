import { encodeFunctionData } from 'viem'

import { sendTransaction } from '@/lib/ethereum/provider'

import { ERC20_ABI, USDT_ADDRESS } from './constants'
import { assertValidAddress } from './validation'

export interface UsdtTransferRequest {
  from: string
  recipient: string
  amountRaw: bigint
}

/**
 * Encode an ERC-20 `transfer(recipient, amount)` call.
 * The transaction `to` is the USDT contract; the recipient lives in `data`.
 */
export function encodeUsdtTransfer(
  recipient: string,
  amountRaw: bigint,
): `0x${string}` {
  const to = assertValidAddress(recipient, 'recipient address')
  return encodeFunctionData({
    abi: ERC20_ABI,
    functionName: 'transfer',
    args: [to as `0x${string}`, amountRaw],
  })
}

/**
 * Send a USDT transfer through the injected wallet provider.
 * Requires user confirmation in Nimiq Pay.
 */
export async function sendUsdtTransfer(
  request: UsdtTransferRequest,
): Promise<string> {
  const from = assertValidAddress(request.from, 'sender address')
  const recipient = assertValidAddress(request.recipient, 'recipient address')

  if (request.amountRaw <= 0n) {
    throw new Error('Payment amount must be greater than zero.')
  }

  const data = encodeUsdtTransfer(recipient, request.amountRaw)

  return sendTransaction({
    from,
    to: USDT_ADDRESS,
    data,
    value: '0x0',
  })
}
