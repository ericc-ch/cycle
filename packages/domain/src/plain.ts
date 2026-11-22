import { Array, Option } from 'effect'

import type { PlainDate } from './date.ts'
import {
  type DayLog,
  type Flow,
  type Period,
  cycleLengthsByPeriod,
  flowOn,
  latestPeriod,
} from './period.ts'
import { cycleDayFor } from './predict.ts'

/** Plain-value views of the domain. The domain uses Effect `Option`
 *  internally and in its own tests; a UI that only needs a value or `null`
 *  can use these instead of importing Effect. */

export const flowAt = (
  logs: ReadonlyArray<DayLog>,
  date: PlainDate,
): Flow | null => Option.getOrNull(flowOn(logs, date))

export const cycleDayAt = (
  periods: ReadonlyArray<Period>,
  today: PlainDate,
): number | null => Option.getOrNull(cycleDayFor(periods, today))

export const latestPeriodAt = (periods: ReadonlyArray<Period>): Period | null =>
  Option.getOrNull(latestPeriod(periods))

/** One entry per period: the gap from the previous start, or `null` for the
 *  first and for a gap the domain dropped as out of range. */
export const cycleGaps = (
  periods: ReadonlyArray<Period>,
): ReadonlyArray<number | null> =>
  Array.map(cycleLengthsByPeriod(periods), Option.getOrNull)

export const presentGaps = (
  gaps: ReadonlyArray<number | null>,
): ReadonlyArray<number> => gaps.filter((gap): gap is number => gap !== null)
