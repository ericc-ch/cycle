import { Option } from 'effect'
import { describe, expect, test } from 'vitest'

import {
  dateKeyFromMillis,
  dateKeyFromParts,
  datesBetween,
  dayOfMonthLabel,
  formatDayNumber,
  parseDayNumber,
  partsFromDateKey,
  shiftDateKey,
  weekdayLabel,
} from './date'

describe('parseDayNumber', () => {
  test('parses a real date to a whole day number', () => {
    const dayNumber = Option.getOrThrow(parseDayNumber('2026-11-02'))

    expect(Number.isInteger(dayNumber)).toBe(true)
    expect(formatDayNumber(dayNumber)).toBe('2026-11-02')
  })

  test('rejects dates that do not exist', () => {
    expect(parseDayNumber('2026-02-31')).toStrictEqual(Option.none())
    expect(parseDayNumber('2026-13-01')).toStrictEqual(Option.none())
  })

  test('rejects anything that is not zero padded', () => {
    expect(parseDayNumber('2026-2-3')).toStrictEqual(Option.none())
    expect(parseDayNumber('')).toStrictEqual(Option.none())
    expect(parseDayNumber('today')).toStrictEqual(Option.none())
  })
})

describe('day arithmetic', () => {
  test('crosses a month boundary', () => {
    expect(shiftDateKey('2026-10-31', 1)).toStrictEqual(
      Option.some('2026-11-01'),
    )
  })

  test('crosses a year boundary backwards', () => {
    expect(shiftDateKey('2026-01-01', -1)).toStrictEqual(
      Option.some('2025-12-31'),
    )
  })

  test('counts a leap day', () => {
    expect(shiftDateKey('2028-02-28', 1)).toStrictEqual(
      Option.some('2028-02-29'),
    )
  })
})

describe('labels', () => {
  test('two November days are one and two days apart', () => {
    const first = Option.getOrThrow(parseDayNumber('2026-11-02'))
    const second = Option.getOrThrow(parseDayNumber('2026-11-03'))

    expect(second - first).toBe(1)
    expect(weekdayLabel(first)).toBe('Mon')
    expect(dayOfMonthLabel(first)).toBe('2')
  })

  test('builds a local date key from a timestamp', () => {
    const millis = Date.UTC(2026, 10, 2, 12, 0, 0)

    expect(dateKeyFromMillis(millis)).toMatch(/^2026-11-0[12]$/)
  })
})

describe('parts', () => {
  test('splits a date key for a calendar', () => {
    expect(partsFromDateKey('2026-10-06')).toStrictEqual(
      Option.some({ year: 2026, month: 10, day: 6 }),
    )
  })

  test('rejects a key that is not a real date', () => {
    expect(partsFromDateKey('2026-02-30')).toStrictEqual(Option.none())
    expect(partsFromDateKey('06/10/2026')).toStrictEqual(Option.none())
  })

  test('pads the month and day back into a key', () => {
    expect(dateKeyFromParts({ year: 2026, month: 1, day: 5 })).toBe(
      '2026-01-05',
    )
  })
})

describe('datesBetween', () => {
  test('lists both ends and every day inside', () => {
    expect(datesBetween('2026-10-17', '2026-10-20')).toStrictEqual([
      '2026-10-17',
      '2026-10-18',
      '2026-10-19',
      '2026-10-20',
    ])
  })

  test('reads the same either way round', () => {
    expect(datesBetween('2026-10-20', '2026-10-17')).toStrictEqual(
      datesBetween('2026-10-17', '2026-10-20'),
    )
  })

  test('a single day is one entry', () => {
    expect(datesBetween('2026-10-20', '2026-10-20')).toStrictEqual([
      '2026-10-20',
    ])
  })

  test('crosses a month boundary', () => {
    expect(datesBetween('2026-10-30', '2026-11-02')).toStrictEqual([
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
    ])
  })

  test('gives nothing for a key that is not a date', () => {
    expect(datesBetween('2026-02-30', '2026-03-02')).toStrictEqual([])
  })
})
