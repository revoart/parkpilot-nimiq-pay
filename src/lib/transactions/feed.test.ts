import { describe, expect, it } from 'vitest'

import {
  sortTransactions,
  transactionAmountNim,
  transactionSign,
  transactionTitle,
  type TransactionEntry,
} from './feed'

function entry(overrides: Partial<TransactionEntry>): TransactionEntry {
  return {
    type: 'parking_payment',
    tx_hash: null,
    amount_nim: 0,
    amount_raw: '0',
    direction: 'debit',
    status: null,
    label: 'Nice parking',
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('sortTransactions', () => {
  it('orders newest first', () => {
    const older = entry({ created_at: '2026-01-01T00:00:00.000Z' })
    const newer = entry({ created_at: '2026-01-02T00:00:00.000Z' })

    expect(sortTransactions([older, newer])).toEqual([newer, older])
  })

  it('does not mutate the input', () => {
    const input = [
      entry({ created_at: '2026-01-01T00:00:00.000Z' }),
      entry({ created_at: '2026-01-02T00:00:00.000Z' }),
    ]
    const snapshot = [...input]

    sortTransactions(input)

    expect(input).toEqual(snapshot)
  })

  it('keeps the original order for equal timestamps', () => {
    const first = entry({ label: 'first' })
    const second = entry({ label: 'second' })

    expect(sortTransactions([first, second]).map((e) => e.label)).toEqual([
      'first',
      'second',
    ])
  })

  it('sorts an unparseable timestamp to the end', () => {
    const valid = entry({ created_at: '2026-01-01T00:00:00.000Z', label: 'valid' })
    const invalid = entry({ created_at: '', label: 'invalid' })

    expect(sortTransactions([invalid, valid]).map((e) => e.label)).toEqual([
      'valid',
      'invalid',
    ])
  })
})

describe('transactionSign', () => {
  it('is negative for money out', () => {
    expect(transactionSign(entry({ direction: 'debit' }))).toBe('-')
  })

  it('is positive for money in', () => {
    expect(
      transactionSign(entry({ type: 'host_revenue', direction: 'credit' })),
    ).toBe('+')
  })
})

describe('transactionTitle', () => {
  it('prefixes a driver payment', () => {
    expect(transactionTitle(entry({ label: 'Nice parking' }))).toBe(
      'Parking payment · Nice parking',
    )
  })

  it('prefixes host earnings', () => {
    expect(
      transactionTitle(
        entry({ type: 'host_revenue', direction: 'credit', label: 'Nice parking' }),
      ),
    ).toBe('Host earnings · Nice parking')
  })
})

describe('transactionAmountNim', () => {
  it('renders the exact Luna amount, trimming trailing zeros', () => {
    expect(transactionAmountNim(entry({ amount_raw: '900', amount_nim: 0.009 }))).toBe(
      '0.009',
    )
    expect(transactionAmountNim(entry({ amount_raw: '1000', amount_nim: 0.01 }))).toBe(
      '0.01',
    )
  })

  it('falls back to the transported decimal when raw cannot be parsed', () => {
    expect(
      transactionAmountNim(entry({ amount_raw: 'not-a-number', amount_nim: 1.25 })),
    ).toBe('1.25')
  })
})
