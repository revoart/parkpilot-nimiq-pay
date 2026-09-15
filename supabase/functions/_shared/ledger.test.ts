import { describe, expect, it } from 'vitest'

import { splitRaw } from './ledger'

const ONE_USDT = 1_000_000n

describe('splitRaw', () => {
  it('splits a 10% platform fee', () => {
    const { hostRaw, feeRaw } = splitRaw(100n * ONE_USDT, 1000)
    expect(feeRaw).toBe(10n * ONE_USDT)
    expect(hostRaw).toBe(90n * ONE_USDT)
  })

  it('takes no fee when the rate is zero', () => {
    const { hostRaw, feeRaw } = splitRaw(42n * ONE_USDT, 0)
    expect(feeRaw).toBe(0n)
    expect(hostRaw).toBe(42n * ONE_USDT)
  })

  it('gives the whole amount to the platform at 100%', () => {
    const { hostRaw, feeRaw } = splitRaw(7n * ONE_USDT, 10_000)
    expect(feeRaw).toBe(7n * ONE_USDT)
    expect(hostRaw).toBe(0n)
  })

  it('never lets the fee exceed the gross amount', () => {
    const { hostRaw, feeRaw } = splitRaw(5n * ONE_USDT, 20_000)
    expect(feeRaw).toBe(5n * ONE_USDT)
    expect(hostRaw).toBe(0n)
  })

  it('rounds the fee down so the host is never short-changed', () => {
    // 10% of 1 raw unit is 0.1 -> floors to 0.
    const { hostRaw, feeRaw } = splitRaw(1n, 1000)
    expect(feeRaw).toBe(0n)
    expect(hostRaw).toBe(1n)
  })

  it('treats a negative rate as no fee', () => {
    const { hostRaw, feeRaw } = splitRaw(9n * ONE_USDT, -500)
    expect(feeRaw).toBe(0n)
    expect(hostRaw).toBe(9n * ONE_USDT)
  })

  it('rounds a fractional rate to the nearest basis point', () => {
    const { feeRaw } = splitRaw(100n * ONE_USDT, 1000.4)
    expect(feeRaw).toBe(10n * ONE_USDT)
  })

  it('conserves value for a range of amounts and rates', () => {
    const rates = [0, 1, 250, 1000, 2500, 9999]
    const amounts = [1n, 999n, ONE_USDT, 99_990_400n, 123_456_789n]

    for (const rate of rates) {
      for (const gross of amounts) {
        const { hostRaw, feeRaw } = splitRaw(gross, rate)
        expect(hostRaw + feeRaw).toBe(gross)
        expect(hostRaw >= 0n).toBe(true)
        expect(feeRaw >= 0n).toBe(true)
      }
    }
  })

  it('matches the documented fee on the live payout example', () => {
    // 111.1004 USDT gross at 10% -> 11.11004 fee, 99.99036 host.
    const gross = 111_100_400n
    const { hostRaw, feeRaw } = splitRaw(gross, 1000)
    expect(feeRaw).toBe(11_110_040n)
    expect(hostRaw).toBe(99_990_360n)
  })
})
