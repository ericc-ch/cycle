import { Array, Option, Order, Schema, pipe } from 'effect'

import {
  type PlainDate,
  PlainDateSchema,
  dateFromDayNumber,
  dayNumber,
  plainDateOrder,
  sameDay,
} from './date.ts'

export const Flow = Schema.Literals(['Spotting', 'Bleeding'])
export type Flow = typeof Flow.Type

/** What older builds stored: spotting plus three heaviness levels. Read on
 *  boot so an existing log is not lost; nothing writes it any more. */
export const StoredFlow = Schema.Literals([
  'Spotting',
  'Light',
  'Medium',
  'Heavy',
  'Bleeding',
])
export type StoredFlow = typeof StoredFlow.Type

export const flowFromStored = (flow: StoredFlow): Flow =>
  flow === 'Spotting' ? 'Spotting' : 'Bleeding'

export const DayLog = Schema.Struct({
  date: PlainDateSchema,
  flow: Flow,
})
export type DayLog = typeof DayLog.Type

export const Period = Schema.Struct({
  start: PlainDateSchema,
  end: PlainDateSchema,
})
export type Period = typeof Period.Type

const MIN_CYCLE_DAYS = 15
const MAX_CYCLE_DAYS = 90
const MAX_BREAK_DAYS = 2
const MAX_TRAILING_SPOTTING_DAYS = 1

export const isBleedingFlow = (flow: Flow): boolean => flow === 'Bleeding'

type DraftPeriod = {
  readonly start: number
  readonly end: number
  readonly lastBleedingDay: number
}

type BleedingDay = { readonly day: number; readonly flow: Flow }

const bleedingDays = (
  logs: ReadonlyArray<DayLog>,
): ReadonlyArray<BleedingDay> => {
  const present: ReadonlyArray<BleedingDay> = Array.map(logs, log => ({
    day: dayNumber(log.date),
    flow: log.flow,
  }))

  return Array.sort(
    present,
    Order.mapInput(Order.Number, (entry: BleedingDay) => entry.day),
  )
}

const absorbDay = (
  drafts: ReadonlyArray<DraftPeriod>,
  day: number,
  flow: Flow,
): ReadonlyArray<DraftPeriod> =>
  Option.match(Array.last(drafts), {
    onNone: () =>
      isBleedingFlow(flow)
        ? [{ start: day, end: day, lastBleedingDay: day }]
        : drafts,

    onSome: current => {
      if (isBleedingFlow(flow)) {
        return day - current.lastBleedingDay <= MAX_BREAK_DAYS
          ? [
              ...drafts.slice(0, -1),
              { ...current, end: day, lastBleedingDay: day },
            ]
          : [...drafts, { start: day, end: day, lastBleedingDay: day }]
      }

      const isTrailingSpotting =
        day - current.lastBleedingDay <= MAX_TRAILING_SPOTTING_DAYS

      return isTrailingSpotting
        ? [...drafts.slice(0, -1), { ...current, end: day }]
        : drafts
    },
  })

export const periodsFrom = (
  logs: ReadonlyArray<DayLog>,
): ReadonlyArray<Period> => {
  const empty: ReadonlyArray<DraftPeriod> = []

  return pipe(
    bleedingDays(logs),
    Array.reduce(empty, (drafts, { day, flow }) =>
      absorbDay(drafts, day, flow),
    ),
    Array.map(draft => ({
      start: dateFromDayNumber(draft.start),
      end: dateFromDayNumber(draft.end),
    })),
  )
}

export const periodDayCount = (period: Period): number =>
  dayNumber(period.end) - dayNumber(period.start) + 1

/** One entry per period: the gap from the previous start, or `None` for the
 *  first. Out-of-range gaps stay in place as `None` so an entry always lines
 *  up with its period. */
export const cycleLengthsByPeriod = (
  periods: ReadonlyArray<Period>,
): ReadonlyArray<Option.Option<number>> =>
  Array.map(periods, (period, index) =>
    Option.flatMap(Array.get(periods, index - 1), previous => {
      const length = dayNumber(period.start) - dayNumber(previous.start)

      return length >= MIN_CYCLE_DAYS && length <= MAX_CYCLE_DAYS
        ? Option.some(length)
        : Option.none()
    }),
  )

export const cycleLengths = (
  periods: ReadonlyArray<Period>,
): ReadonlyArray<number> => Array.getSomes(cycleLengthsByPeriod(periods))

export const periodsSorted = (
  periods: ReadonlyArray<Period>,
): ReadonlyArray<Period> =>
  Array.sort(
    periods,
    Order.mapInput(plainDateOrder, (period: Period) => period.start),
  )

export const latestPeriod = (
  periods: ReadonlyArray<Period>,
): Option.Option<Period> => Array.last(periodsSorted(periods))

export const logsSorted = (
  logs: ReadonlyArray<DayLog>,
): ReadonlyArray<DayLog> =>
  Array.sort(
    logs,
    Order.mapInput(plainDateOrder, (log: DayLog) => log.date),
  )

export const flowOn = (
  logs: ReadonlyArray<DayLog>,
  date: PlainDate,
): Option.Option<Flow> =>
  Option.map(
    Array.findFirst(logs, log => sameDay(log.date, date)),
    log => log.flow,
  )
