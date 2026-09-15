import { encodeFunctionData } from 'viem'

import { callContract } from '@/lib/ethereum/provider'

import { fromRawAmount } from './amounts'
import { ERC20_ABI, USDT_ADDRESS } from './constants'
import { assertValidAddress } from './validation'

export async function readUsdtBalanceRaw(address: string): Promise<bigint> {
  const owner = assertValidAddress(address, 'wallet address')
  const data = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [owner as `0x${string}`],
  })
  const result = await callContract({ to: USDT_ADDRESS, data })
  return BigInt(result)
}

export async function readUsdtBalance(address: string): Promise<string> {
  return fromRawAmount(await readUsdtBalanceRaw(address))
}
