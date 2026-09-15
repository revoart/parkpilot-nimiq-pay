import { getSupabase } from '@/lib/supabase/client'

export interface AvailabilityRule {
  id: string
  parking_space_id: string
  weekday: number
  start_time: string
  end_time: string
  active: boolean
}

export interface AvailabilityException {
  id: string
  parking_space_id: string
  date: string
  start_time: string
  end_time: string
  available: boolean
}

export interface DayAvailability {
  date: string
  windows: { start: string; end: string }[]
}

function toMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map(Number)
  return hours * 60 + (minutes || 0)
}

function fromMinutes(total: number): string {
  const hours = Math.floor(total / 60)
  const minutes = total % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

/** 30-minute start times inside a window (leaves room for a short booking). */
export function slotStarts(window: { start: string; end: string }): string[] {
  const slots: string[] = []
  const start = toMinutes(window.start)
  const end = toMinutes(window.end)
  for (let minute = start; minute + 30 <= end; minute += 30) {
    slots.push(fromMinutes(minute))
  }
  return slots
}

export function windowForTime(
  windows: { start: string; end: string }[],
  time: string,
): { start: string; end: string } | null {
  const target = toMinutes(time)
  return (
    windows.find(
      (window) => toMinutes(window.start) <= target && target < toMinutes(window.end),
    ) ?? null
  )
}

export interface AvailabilityData {
  rules: AvailabilityRule[]
  exceptions: AvailabilityException[]
}

export async function getAvailability(
  parkingSpaceId: string,
): Promise<AvailabilityData> {
  const supabase = getSupabase()

  const [rulesResult, exceptionsResult] = await Promise.all([
    supabase
      .from('parking_availability_rules')
      .select('*')
      .eq('parking_space_id', parkingSpaceId),
    supabase
      .from('parking_availability')
      .select('*')
      .eq('parking_space_id', parkingSpaceId),
  ])

  if (rulesResult.error) throw new Error(rulesResult.error.message)
  if (exceptionsResult.error) throw new Error(exceptionsResult.error.message)

  return {
    rules: (rulesResult.data ?? []) as AvailabilityRule[],
    exceptions: (exceptionsResult.data ?? []) as AvailabilityException[],
  }
}

/** Resolve the bookable windows for a given date. */
export function windowsForDate(
  data: AvailabilityData,
  date: string,
): { start: string; end: string }[] {
  const day = new Date(`${date}T12:00:00`)
  const weekday = day.getDay()

  const blocked = data.exceptions.some(
    (exception) => exception.date === date && !exception.available,
  )
  if (blocked) return []

  const dateWindows = data.exceptions
    .filter((exception) => exception.date === date && exception.available)
    .map((exception) => ({
      start: exception.start_time.slice(0, 5),
      end: exception.end_time.slice(0, 5),
    }))

  if (dateWindows.length > 0) return dateWindows

  return data.rules
    .filter((rule) => rule.active && rule.weekday === weekday)
    .map((rule) => ({
      start: rule.start_time.slice(0, 5),
      end: rule.end_time.slice(0, 5),
    }))
}

/** Upcoming days (ISO date) that have at least one window. */
export function availableDays(
  data: AvailabilityData,
  count = 30,
): DayAvailability[] {
  const days: DayAvailability[] = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  for (let index = 0; index < count; index += 1) {
    const date = new Date(today.getTime() + index * 86_400_000)
    const offset = date.getTimezoneOffset()
    const iso = new Date(date.getTime() - offset * 60_000)
      .toISOString()
      .slice(0, 10)
    const windows = windowsForDate(data, iso)
    if (windows.length > 0) days.push({ date: iso, windows })
  }

  return days
}

export function hasAnyAvailability(data: AvailabilityData): boolean {
  return (
    data.rules.some((rule) => rule.active) ||
    data.exceptions.some((exception) => exception.available)
  )
}
