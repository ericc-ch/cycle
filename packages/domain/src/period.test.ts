import { Option } from 'effect'
import { describe, expect, test } from 'vitest'

import { formatPlainDate, parsePlainDate } from './date'
import {
  type DayLog,
  type Period,
  cycleLengths,
  cycleLengthsByPeriod,
  flowFromStored,
  flowOn,
  isBleedingFlow,
  latestPeriod,
  periodsFrom,
} from './period'

const date = (value: string) => {
  const parsed = parsePlainDate(value)

  if (parsed === null) {
    throw new Error(`not a date: ${value}`)
  }

  return parsed
}

const log = (value: string, flow: DayLog['flow']): DayLog => ({
  date: date(value),
  flow,
})

/** The same shape the storage boundary writes: dates as `YYYY-MM-DD`. */
const iso = (periods: ReadonlyArray<Period>) =>
  periods.map(period => ({
    start: formatPlainDate(period.start),
    end: formatPlainDate(period.end),
  }))

describe('periodsFrom', () => {
  test('groups consecutive bleeding days into one period', () => {
    const periods = periodsFrom([
      log('2026-10-03', 'Bleeding'),
      log('2026-10-04', 'Bleeding'),
      log('2026-10-05', 'Bleeding'),
    ])

    expect(iso(periods)).toStrictEqual([
      { start: '2026-10-03', end: '2026-10-05' },
    ])
  })

  test('one clear day in the middle stays inside the same period', () => {
    const periods = periodsFrom([
      log('2026-10-03', 'Bleeding'),
      log('2026-10-04', 'Bleeding'),
      log('2026-10-06', 'Bleeding'),
    ])

    expect(iso(periods)).toStrictEqual([
      { start: '2026-10-03', end: '2026-10-06' },
    ])
  })

  test('two clear days start a new period', () => {
    const periods = periodsFrom([
      log('2026-10-03', 'Bleeding'),
      log('2026-10-06', 'Bleeding'),
    ])

    expect(iso(periods)).toStrictEqual([
      { start: '2026-10-03', end: '2026-10-03' },
      { start: '2026-10-06', end: '2026-10-06' },
    ])
  })

  test('spotting alone never starts a period', () => {
    expect(periodsFrom([log('2026-10-03', 'Spotting')])).toStrictEqual([])
  })

  test('spotting before the first bleeding day does not move the start', () => {
    const periods = periodsFrom([
      log('2026-10-02', 'Spotting'),
      log('2026-10-03', 'Bleeding'),
    ])

    expect(iso(periods)).toStrictEqual([
      { start: '2026-10-03', end: '2026-10-03' },
    ])
  })

  test('spotting right after a period extends the end', () => {
    const periods = periodsFrom([
      log('2026-10-03', 'Bleeding'),
      log('2026-10-04', 'Bleeding'),
      log('2026-10-05', 'Spotting'),
    ])

    expect(iso(periods)).toStrictEqual([
      { start: '2026-10-03', end: '2026-10-05' },
    ])
  })

  test('a spotting day two days later does not extend the period', () => {
    const periods = periodsFrom([
      log('2026-10-03', 'Bleeding'),
      log('2026-10-05', 'Spotting'),
    ])

    expect(iso(periods)).toStrictEqual([
      { start: '2026-10-03', end: '2026-10-03' },
    ])
  })

  test('sorts the days by date before grouping them', () => {
    const periods = periodsFrom([
      log('2026-10-03', 'Bleeding'),
      log('2026-09-01', 'Bleeding'),
    ])

    expect(iso(periods)).toStrictEqual([
      { start: '2026-09-01', end: '2026-09-01' },
      { start: '2026-10-03', end: '2026-10-03' },
    ])
  })
})

describe('cycleLengths', () => {
  test('measures the gap between period starts', () => {
    const periods = periodsFrom([
      log('2026-08-01', 'Bleeding'),
      log('2026-08-29', 'Bleeding'),
      log('2026-09-26', 'Bleeding'),
    ])

    expect(cycleLengths(periods)).toStrictEqual([28, 28])
  })

  test('drops gaps that are too short or too long to be a cycle', () => {
    const periods = periodsFrom([
      log('2026-01-01', 'Bleeding'),
      log('2026-01-10', 'Bleeding'),
      log('2026-02-10', 'Bleeding'),
      log('2026-07-01', 'Bleeding'),
    ])

    expect(cycleLengths(periods)).toStrictEqual([31])
  })

  test('the per-period view keeps its slots so rows stay aligned', () => {
    const periods = periodsFrom([
      log('2026-01-01', 'Bleeding'),
      log('2026-04-11', 'Bleeding'),
      log('2026-05-09', 'Bleeding'),
    ])

    expect(cycleLengthsByPeriod(periods)).toStrictEqual([
      Option.none(),
      Option.none(),
      Option.some(28),
    ])
  })
})

describe('helpers', () => {
  test('isBleedingFlow treats spotting as not bleeding', () => {
    expect(isBleedingFlow('Spotting')).toBe(false)
    expect(isBleedingFlow('Bleeding')).toBe(true)
  })

  test('latestPeriod picks the newest start', () => {
    const periods = periodsFrom([
      log('2026-10-03', 'Bleeding'),
      log('2026-09-05', 'Bleeding'),
    ])

    expect(iso([Option.getOrThrow(latestPeriod(periods))])).toStrictEqual([
      { start: '2026-10-03', end: '2026-10-03' },
    ])
  })

  test('flowOn finds the flow for a day', () => {
    const logs = [log('2026-10-03', 'Bleeding')]

    expect(flowOn(logs, date('2026-10-03'))).toStrictEqual(
      Option.some('Bleeding'),
    )
    expect(flowOn(logs, date('2026-10-04'))).toStrictEqual(Option.none())
  })

  test('only bleeding is bleeding', () => {
    expect(isBleedingFlow('Bleeding')).toBe(true)
    expect(isBleedingFlow('Spotting')).toBe(false)
  })
})

describe('stored flows', () => {
  test('folds the heaviness levels older builds wrote into bleeding', () => {
    expect(flowFromStored('Light')).toBe('Bleeding')
    expect(flowFromStored('Medium')).toBe('Bleeding')
    expect(flowFromStored('Heavy')).toBe('Bleeding')
    expect(flowFromStored('Bleeding')).toBe('Bleeding')
  })

  test('keeps spotting as spotting', () => {
    expect(flowFromStored('Spotting')).toBe('Spotting')
  })
})
