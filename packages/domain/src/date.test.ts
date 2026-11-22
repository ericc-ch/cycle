import { describe, expect, test, vi } from 'vitest'

import {
  addDays,
  dateFromDayNumber,
  datesBetween,
  dayNumber,
  dayOfMonthLabel,
  daysBetween,
  formatPlainDate,
  monthDayLabel,
  parsePlainDate,
  sameDay,
  todayPlainDate,
  weekdayLabel,
} from './date'

const date = (value: string) => {
  const parsed = parsePlainDate(value)

  if (parsed === null) {
    throw new Error(`not a date: ${value}`)
  }

  return parsed
}

describe('parsePlainDate', () => {
  test('reads a real date and writes it back unchanged', () => {
    expect(formatPlainDate(date('2026-11-02'))).toBe('2026-11-02')
  })

  test('rejects dates that do not exist', () => {
    expect(parsePlainDate('2026-02-31')).toBeNull()
    expect(parsePlainDate('2026-13-01')).toBeNull()
  })

  test('rejects anything that is not zero padded', () => {
    expect(parsePlainDate('2026-2-3')).toBeNull()
    expect(parsePlainDate('')).toBeNull()
    expect(parsePlainDate('today')).toBeNull()
    expect(parsePlainDate('2026-11-10T00:00')).toBeNull()
  })
})

describe('day arithmetic', () => {
  test('adds a day across a month boundary', () => {
    expect(formatPlainDate(addDays(date('2026-10-31'), 1))).toBe('2026-11-01')
  })

  test('subtracts a day across a year boundary', () => {
    expect(formatPlainDate(addDays(date('2026-01-01'), -1))).toBe('2025-12-31')
  })

  test('counts a leap day', () => {
    expect(formatPlainDate(addDays(date('2028-02-28'), 1))).toBe('2028-02-29')
  })

  test('a day number round trips through the epoch', () => {
    expect(
      formatPlainDate(dateFromDayNumber(dayNumber(date('2026-11-02')))),
    ).toBe('2026-11-02')
  })

  test('two days apart is one', () => {
    expect(daysBetween(date('2026-11-02'), date('2026-11-03'))).toBe(1)
  })

  test('the same day reads the same from two sources', () => {
    expect(sameDay(date('2026-11-02'), date('2026-11-02'))).toBe(true)
    expect(sameDay(date('2026-11-02'), date('2026-11-03'))).toBe(false)
  })
})

describe('labels', () => {
  test('names a November day', () => {
    const day = date('2026-11-02')

    expect(weekdayLabel(day)).toBe('Mon')
    expect(dayOfMonthLabel(day)).toBe('2')
    expect(monthDayLabel(day)).toBe('2 Nov')
  })

  test("today comes from the local calendar, not UTC's", () => {
    vi.useFakeTimers({ now: new Date(2026, 10, 2, 23, 30) })

    expect(formatPlainDate(todayPlainDate())).toBe('2026-11-02')

    vi.useRealTimers()
  })
})

describe('datesBetween', () => {
  test('lists both ends and every day inside', () => {
    expect(
      datesBetween(date('2026-10-17'), date('2026-10-20')).map(formatPlainDate),
    ).toStrictEqual(['2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20'])
  })

  test('reads the same either way round', () => {
    expect(
      datesBetween(date('2026-10-20'), date('2026-10-17')).map(formatPlainDate),
    ).toStrictEqual(
      datesBetween(date('2026-10-17'), date('2026-10-20')).map(formatPlainDate),
    )
  })

  test('a single day is one entry', () => {
    expect(
      datesBetween(date('2026-10-20'), date('2026-10-20')).map(formatPlainDate),
    ).toStrictEqual(['2026-10-20'])
  })

  test('crosses a month boundary', () => {
    expect(
      datesBetween(date('2026-10-30'), date('2026-11-02')).map(formatPlainDate),
    ).toStrictEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02'])
  })
})
