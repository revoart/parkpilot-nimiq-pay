import { describe, expect, it } from 'vitest'

import {
  availableDays,
  dayRulesToInput,
  defaultDayRules,
  describeDayRules,
  hasAnyAvailability,
  slotStarts,
  windowForTime,
  windowsForDate,
  type AvailabilityData,
  type DayRule,
} from './availability'

function data(partial: Partial<AvailabilityData> = {}): AvailabilityData {
  return { rules: [], exceptions: [], ...partial }
}

function rule(weekday: number, start: string, end: string, active = true) {
  return {
    id: `r-${weekday}`,
    parking_space_id: 'space-1',
    weekday,
    start_time: `${start}:00`,
    end_time: `${end}:00`,
    active,
  }
}

describe('slotStarts', () => {
  it('returns 30-minute starts inside a window', () => {
    expect(slotStarts({ start: '08:00', end: '10:00' })).toEqual([
      '08:00',
      '08:30',
      '09:00',
      '09:30',
    ])
  })

  it('leaves room for a booking at the end of the window', () => {
    expect(slotStarts({ start: '08:00', end: '08:30' })).toEqual(['08:00'])
  })

  it('returns nothing for an empty or inverted window', () => {
    expect(slotStarts({ start: '08:00', end: '08:00' })).toEqual([])
    expect(slotStarts({ start: '10:00', end: '08:00' })).toEqual([])
  })

  it('handles a full-day window', () => {
    const slots = slotStarts({ start: '00:00', end: '24:00' })
    expect(slots).toHaveLength(48)
    expect(slots[0]).toBe('00:00')
    expect(slots.at(-1)).toBe('23:30')
  })
})

describe('windowForTime', () => {
  const windows = [{ start: '08:00', end: '20:00' }]

  it('matches a time inside the window', () => {
    expect(windowForTime(windows, '12:00')).toEqual(windows[0])
  })

  it('treats the start as inclusive', () => {
    expect(windowForTime(windows, '08:00')).toEqual(windows[0])
  })

  it('treats the end as exclusive', () => {
    expect(windowForTime(windows, '20:00')).toBeNull()
  })

  it('returns null outside the window', () => {
    expect(windowForTime(windows, '07:59')).toBeNull()
    expect(windowForTime(windows, '21:00')).toBeNull()
  })

  it('returns null when there are no windows', () => {
    expect(windowForTime([], '12:00')).toBeNull()
  })
})

describe('windowsForDate', () => {
  // 2026-09-15 is a Tuesday (weekday 2).
  const TUESDAY = '2026-09-15'

  it('returns the active rule for that weekday', () => {
    const result = windowsForDate(
      data({ rules: [rule(2, '08:00', '18:00')] }),
      TUESDAY,
    )
    expect(result).toEqual([{ start: '08:00', end: '18:00' }])
  })

  it('ignores rules for other weekdays', () => {
    expect(
      windowsForDate(data({ rules: [rule(3, '08:00', '18:00')] }), TUESDAY),
    ).toEqual([])
  })

  it('ignores inactive rules', () => {
    expect(
      windowsForDate(
        data({ rules: [rule(2, '08:00', '18:00', false)] }),
        TUESDAY,
      ),
    ).toEqual([])
  })

  it('lets a date-specific exception override the weekly rule', () => {
    const result = windowsForDate(
      data({
        rules: [rule(2, '08:00', '18:00')],
        exceptions: [
          {
            id: 'e1',
            parking_space_id: 'space-1',
            date: TUESDAY,
            start_time: '10:00:00',
            end_time: '12:00:00',
            available: true,
          },
        ],
      }),
      TUESDAY,
    )
    expect(result).toEqual([{ start: '10:00', end: '12:00' }])
  })

  it('blocks the whole day when a date is marked unavailable', () => {
    const result = windowsForDate(
      data({
        rules: [rule(2, '08:00', '18:00')],
        exceptions: [
          {
            id: 'e1',
            parking_space_id: 'space-1',
            date: TUESDAY,
            start_time: '00:00:00',
            end_time: '00:00:00',
            available: false,
          },
        ],
      }),
      TUESDAY,
    )
    expect(result).toEqual([])
  })

  it('returns nothing when no rules exist', () => {
    expect(windowsForDate(data(), TUESDAY)).toEqual([])
  })
})

describe('availableDays', () => {
  it('lists only days that have windows', () => {
    const days = availableDays(
      data({ rules: [rule(2, '08:00', '18:00')] }),
      30,
    )
    expect(days.length).toBeGreaterThan(0)
    expect(days.every((day) => day.windows.length > 0)).toBe(true)
    for (const day of days) {
      expect(new Date(`${day.date}T12:00:00`).getDay()).toBe(2)
    }
  })

  it('returns nothing when every day is blocked', () => {
    expect(availableDays(data(), 30)).toEqual([])
  })

  it('honours the requested day count', () => {
    const days = availableDays(data({ rules: [rule(2, '08:00', '18:00')] }), 7)
    expect(days.length).toBeLessThanOrEqual(1)
  })
})

describe('hasAnyAvailability', () => {
  it('is false when nothing is configured', () => {
    expect(hasAnyAvailability(data())).toBe(false)
  })

  it('is true when a weekly rule is active', () => {
    expect(hasAnyAvailability(data({ rules: [rule(2, '08:00', '18:00')] }))).toBe(
      true,
    )
  })

  it('is false when every rule is inactive', () => {
    expect(
      hasAnyAvailability(data({ rules: [rule(2, '08:00', '18:00', false)] })),
    ).toBe(false)
  })

  it('is true when a date exception opens a window', () => {
    expect(
      hasAnyAvailability(
        data({
          exceptions: [
            {
              id: 'e1',
              parking_space_id: 'space-1',
              date: '2026-09-15',
              start_time: '10:00:00',
              end_time: '12:00:00',
              available: true,
            },
          ],
        }),
      ),
    ).toBe(true)
  })
})

describe('defaultDayRules', () => {
  it('starts with every day off, meaning any time', () => {
    const days = defaultDayRules()
    expect(days).toHaveLength(7)
    expect(days.every((day) => !day.enabled)).toBe(true)
    expect(describeDayRules(days)).toBe('Any time')
  })
})

describe('dayRulesToInput', () => {
  it('maps enabled days to weekday rules', () => {
    const days: DayRule[] = defaultDayRules().map((day, index) =>
      index === 1 || index === 3
        ? { ...day, enabled: true, start: '09:00', end: '17:00' }
        : day,
    )
    const { rules, error } = dayRulesToInput(days)
    expect(error).toBeNull()
    expect(rules).toEqual([
      { weekday: 1, start_time: '09:00', end_time: '17:00', active: true },
      { weekday: 3, start_time: '09:00', end_time: '17:00', active: true },
    ])
  })

  it('returns no rules when every day is off', () => {
    const { rules, error } = dayRulesToInput(defaultDayRules())
    expect(rules).toEqual([])
    expect(error).toBeNull()
  })

  it('rejects a window that ends before it starts', () => {
    const days = defaultDayRules().map((day, index) =>
      index === 0 ? { ...day, enabled: true, start: '20:00', end: '08:00' } : day,
    )
    const { error } = dayRulesToInput(days)
    expect(error).toBe('End time must be after start time.')
  })

  it('rejects a zero-length window', () => {
    const days = defaultDayRules().map((day, index) =>
      index === 0 ? { ...day, enabled: true, start: '08:00', end: '08:00' } : day,
    )
    expect(dayRulesToInput(days).error).not.toBeNull()
  })

  it('ignores invalid windows on disabled days', () => {
    const days = defaultDayRules().map((day, index) =>
      index === 0 ? { ...day, start: '20:00', end: '08:00' } : day,
    )
    expect(dayRulesToInput(days).error).toBeNull()
  })
})

describe('describeDayRules', () => {
  it('summarises a uniform week', () => {
    const days = defaultDayRules().map((day) => ({
      ...day,
      enabled: true,
      start: '08:00',
      end: '20:00',
    }))
    expect(describeDayRules(days)).toBe('Every day 08:00–20:00')
  })

  it('lists individual days when they differ', () => {
    const days = defaultDayRules().map((day, index) =>
      index === 0 ? { ...day, enabled: true, start: '08:00', end: '12:00' } : day,
    )
    expect(describeDayRules(days)).toBe('Sun 08:00–12:00')
  })

  it('joins multiple differing days', () => {
    const days = defaultDayRules().map((day, index) => {
      if (index === 0) return { ...day, enabled: true, start: '08:00', end: '12:00' }
      if (index === 2) return { ...day, enabled: true, start: '09:00', end: '17:00' }
      return day
    })
    expect(describeDayRules(days)).toBe('Sun 08:00–12:00, Tue 09:00–17:00')
  })

  it('reports a partial uniform week as a list, not "Every day"', () => {
    const days = defaultDayRules().map((day, index) =>
      index < 5 ? { ...day, enabled: true, start: '08:00', end: '20:00' } : day,
    )
    expect(describeDayRules(days)).toContain('Sun 08:00–20:00')
    expect(describeDayRules(days)).not.toContain('Every day')
  })
})
