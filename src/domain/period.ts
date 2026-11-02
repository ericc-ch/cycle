import { Array, Option, Order, Schema, pipe } from 'effect'

import {
  type DateKey,
  dateKeyOrder,
  formatDayNumber,
  parseDayNumber,
} from './date'

export const Flow = Schema.Literals(['Spotting', 'Light', 'Medium', 'Heavy'])
export type Flow = typeof Flow.Type

export const DayLog = Schema.Struct({
  date: Schema.String,
  flow: Flow,
})
export type DayLog = typeof DayLog.Type

export const Period = Schema.Struct({
  start: Schema.String,
  end: Schema.String,
})
export type Period = typeof Period.Type

const MIN_CYCLE_DAYS = 15
const MAX_CYCLE_DAYS = 90
const MAX_BREAK_DAYS = 2
const MAX_TRAILING_SPOTTING_DAYS = 1

export const isBleedingFlow = (flow: Flow): boolean => flow !== 'Spotting'

type DraftPeriod = {
  readonly start: number
  readonly end: number
  readonly lastBleedingDay: number
}

type BleedingDay = { readonly day: number; readonly flow: Flow }

const bleedingDays = (
  logs: ReadonlyArray<DayLog>,
): ReadonlyArray<BleedingDay> => {
  const parsed = Array.map(logs, log =>
    Option.map(parseDayNumber(log.date), day => ({ day, flow: log.flow })),
  )
  const present: ReadonlyArray<BleedingDay> = Array.getSomes(parsed)

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
      start: formatDayNumber(draft.start),
      end: formatDayNumber(draft.end),
    })),
  )
}

export const periodDayCount = (period: Period): Option.Option<number> =>
  Option.map(
    Option.all([parseDayNumber(period.start), parseDayNumber(period.end)]),
    ([start, end]) => end - start + 1,
  )

export const cycleLengths = (
  periods: ReadonlyArray<Period>,
): ReadonlyArray<number> =>
  pipe(
    periods,
    Array.map((period, index) => {
      const maybePrevious = Array.get(periods, index - 1)

      return Option.flatMap(maybePrevious, previous =>
        Option.flatMap(
          Option.all([
            parseDayNumber(previous.start),
            parseDayNumber(period.start),
          ]),
          ([previousStart, start]) => {
            const length = start - previousStart
            return length >= MIN_CYCLE_DAYS && length <= MAX_CYCLE_DAYS
              ? Option.some(length)
              : Option.none()
          },
        ),
      )
    }),
    Array.getSomes,
  )

export const periodsSorted = (
  periods: ReadonlyArray<Period>,
): ReadonlyArray<Period> =>
  Array.sort(
    periods,
    Order.mapInput(dateKeyOrder, (period: Period) => period.start),
  )

export const latestPeriod = (
  periods: ReadonlyArray<Period>,
): Option.Option<Period> => Array.last(periodsSorted(periods))

export const logsSorted = (
  logs: ReadonlyArray<DayLog>,
): ReadonlyArray<DayLog> =>
  Array.sort(
    logs,
    Order.mapInput(dateKeyOrder, (log: DayLog) => log.date),
  )

export const flowOn = (
  logs: ReadonlyArray<DayLog>,
  date: DateKey,
): Option.Option<Flow> =>
  Option.map(
    Array.findFirst(logs, log => log.date === date),
    log => log.flow,
  )
