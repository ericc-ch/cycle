import { Option } from 'effect'
import { describe, expect, test } from 'vitest'

import { parsePlainDate } from './date'
import { type DayLog, periodsFrom } from './period'
import {
  type CycleState,
  CycleState as CycleStateSchema,
  confidenceFor,
  cycleDayFor,
  defaultPredictorOptions,
  forecast,
  isLikelySkip,
  median,
  stateFor,
  withoutLikelySkips,
} from './predict'

const date = (value: string) => {
  const parsed = parsePlainDate(value)

  if (parsed === null) {
    throw new Error(`not a date: ${value}`)
  }

  return parsed
}

const log = (value: string, flow: DayLog['flow'] = 'Bleeding'): DayLog => ({
  date: date(value),
  flow,
})

const periodsFor = (starts: ReadonlyArray<string>) =>
  periodsFrom(starts.map(start => log(start)))

const tagOf = (state: CycleState): string => state._tag

describe('median', () => {
  test('averages the two middle values for an even count', () => {
    expect(median([4, 1, 3, 2])).toBe(2.5)
  })

  test('takes the middle value for an odd count', () => {
    expect(median([5, 1, 3])).toBe(3)
  })
})

describe('forecast', () => {
  test('returns nothing without any cycle length', () => {
    expect(forecast([], 0)).toStrictEqual(Option.none())
  })

  test('cold start pulls a single cycle toward the population mean', () => {
    const forecasted = Option.getOrThrow(forecast([28], 0))

    expect(forecasted.centreDays).toBeCloseTo(28.5, 5)
    expect(forecasted.spreadDays).toBe(
      defaultPredictorOptions.coldStartSpreadDays,
    )
    expect(forecasted.lowDay).toBe(23)
    expect(forecasted.highDay).toBe(34)
  })

  test('steady cycles narrow the window to the spread floor', () => {
    const forecasted = Option.getOrThrow(forecast([30, 30, 30, 30, 30, 30], 0))

    expect(forecasted.centreDays).toBe(30)
    expect(forecasted.spreadDays).toBe(defaultPredictorOptions.spreadFloorDays)
    expect(forecasted.lowDay).toBe(27)
    expect(forecasted.highDay).toBe(33)
  })

  test('a cold start window is wider than a settled one', () => {
    const cold = Option.getOrThrow(forecast([30], 0))
    const settled = Option.getOrThrow(forecast([30, 30, 30, 30, 30, 30], 0))

    expect(cold.highDay - cold.lowDay).toBeGreaterThan(
      settled.highDay - settled.lowDay,
    )
  })

  test('one long cycle moves the median but not the centre much', () => {
    const forecasted = Option.getOrThrow(forecast([28, 29, 30, 28, 29, 40], 0))

    expect(forecasted.centreDays).toBe(29)
    expect(forecasted.spreadDays).toBeGreaterThan(
      defaultPredictorOptions.spreadFloorDays,
    )
  })

  test('a gap that looks like a missed log is left out of the estimate', () => {
    const forecasted = Option.getOrThrow(forecast([28, 29, 30, 28, 29, 60], 0))

    expect(forecasted.likelyDay).toBe(29)
    expect(forecasted.spreadDays).toBe(defaultPredictorOptions.spreadFloorDays)
    expect(forecasted.cyclesCounted).toBe(5)
  })

  test('only the last six cycles count', () => {
    const withOldHistory = Option.getOrThrow(
      forecast([45, 45, 45, 30, 30, 30, 30, 30, 30], 0),
    )

    expect(withOldHistory.centreDays).toBe(30)
  })

  test('a cycle that runs late pushes the estimate forward, but by less than a day a day', () => {
    const settled = [30, 30, 30, 30, 30, 30]
    const onTime = Option.getOrThrow(forecast(settled, 30))
    const late = Option.getOrThrow(forecast(settled, 36))

    expect(late.likelyDay).toBeGreaterThan(onTime.likelyDay)
    expect(late.likelyDay - onTime.likelyDay).toBeLessThan(6)
    expect(late.lowDay).toBeGreaterThanOrEqual(36)
  })
})

describe('confidenceFor', () => {
  test('is rough until three cycles', () => {
    expect(confidenceFor(0)).toBe('Rough')
    expect(confidenceFor(2)).toBe('Rough')
    expect(confidenceFor(3)).toBe('Fair')
    expect(confidenceFor(6)).toBe('Good')
  })
})

describe('stateFor', () => {
  const periods = periodsFor(['2026-09-05', '2026-10-03'])

  test('no periods means no cycle state', () => {
    expect(tagOf(stateFor([], date('2026-10-20')))).toBe('NoCycles')
  })

  test('before the usual day the state is expected', () => {
    const state = stateFor(periods, date('2026-10-20'))

    expect(tagOf(state)).toBe('Expected')
    expect(state).toStrictEqual(
      CycleStateSchema.Expected({
        window: {
          low: date('2026-10-26'),
          high: date('2026-11-06'),
          mostLikely: date('2026-11-01'),
        },
        daysUntil: 12,
        confidence: 'Rough',
      }),
    )
  })

  test('past the usual day but inside the window the state is late', () => {
    const state = stateFor(periods, date('2026-11-02'))

    expect(tagOf(state)).toBe('Late')
    expect(state).toMatchObject({ daysLate: 1 })
  })

  test('past the whole window the state is overdue', () => {
    const state = stateFor(periods, date('2026-11-15'))

    expect(tagOf(state)).toBe('Overdue')
    expect(state).toMatchObject({ daysLate: 14 })
  })

  test('a gap that looks like a missed log still yields a state', () => {
    const missed = periodsFor([
      '2026-06-01',
      '2026-07-20',
      '2026-08-17',
      '2026-09-14',
    ])

    expect(tagOf(stateFor(missed, date('2026-09-20')))).toBe('Expected')
  })
})

describe('likely missed logs', () => {
  test('a gap well over her median is flagged', () => {
    expect(isLikelySkip([30, 30, 30], 51)).toBe(true)
  })

  test('a long but plausible cycle is not', () => {
    expect(isLikelySkip([30, 30, 30], 40)).toBe(false)
  })

  test('nothing is judged on fewer than three lengths', () => {
    expect(isLikelySkip([30, 30], 90)).toBe(false)
  })

  test('the estimate leaves a flagged gap out', () => {
    expect(withoutLikelySkips([30, 30, 30, 60])).toStrictEqual([30, 30, 30])
    expect(withoutLikelySkips([30, 30, 30, 40])).toStrictEqual([30, 30, 30, 40])
  })

  test('the forecast keeps her usual cycle when one period was missed', () => {
    const withGap = Option.getOrThrow(forecast([30, 30, 30, 60], 0))
    const withoutGap = Option.getOrThrow(forecast([30, 30, 30], 0))

    expect(withGap.centreDays).toBe(30)
    expect(withGap.cyclesCounted).toBe(3)
    expect(withGap.likelyDay).toBe(withoutGap.likelyDay)
  })

  test('the check can be turned off for comparison', () => {
    const forecasted = Option.getOrThrow(
      forecast([30, 30, 30, 60], 0, {
        ...defaultPredictorOptions,
        skipRatio: Number.POSITIVE_INFINITY,
      }),
    )

    expect(forecasted.cyclesCounted).toBe(4)
    expect(forecasted.centreDays).toBe(30)
  })
})

describe('cycleDayFor', () => {
  test('counts from the latest period start', () => {
    const periods = periodsFor(['2026-09-05', '2026-10-03'])

    expect(cycleDayFor(periods, date('2026-10-03'))).toStrictEqual(
      Option.some(1),
    )
    expect(cycleDayFor(periods, date('2026-10-20'))).toStrictEqual(
      Option.some(18),
    )
  })

  test('is empty without periods', () => {
    expect(cycleDayFor([], date('2026-10-20'))).toStrictEqual(Option.none())
  })
})
