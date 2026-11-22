import { Array, Order, Schema } from 'effect'

import {
  CalendarDate,
  DateFormatter,
  getLocalTimeZone,
  isSameDay,
  parseDate,
  today as todayInZone,
} from '@internationalized/date'

const MILLISECONDS_PER_DAY = 86_400_000
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** A calendar day with no time and no zone. Two phones in different zones
 *  hold the same value for the same day; a JS `Date` cannot promise that.
 *  `YYYY-MM-DD` is only its text form, written at the storage boundary. */
export type PlainDate = CalendarDate

export const PlainDateSchema = Schema.instanceOf(CalendarDate)

export const parsePlainDate = (value: string): PlainDate | null => {
  if (!ISO_DATE_PATTERN.test(value)) {
    return null
  }

  try {
    return parseDate(value)
  } catch {
    return null
  }
}

export const formatPlainDate = (date: PlainDate): string => date.toString()

/** Boot only: today's local calendar day. */
export const todayPlainDate = (): PlainDate => todayInZone(getLocalTimeZone())

/** Whole days since the epoch. The unit the predictor counts cycles in. */
export const dayNumber = (date: PlainDate): number =>
  Date.UTC(date.year, date.month - 1, date.day) / MILLISECONDS_PER_DAY

export const dateFromDayNumber = (dayNumber: number): PlainDate => {
  const date = new Date(Math.round(dayNumber) * MILLISECONDS_PER_DAY)

  return new CalendarDate(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
  )
}

export const addDays = (date: PlainDate, days: number): PlainDate =>
  date.add({ days })

export const daysBetween = (start: PlainDate, end: PlainDate): number =>
  dayNumber(end) - dayNumber(start)

export const sameDay = isSameDay

export const plainDateOrder: Order.Order<PlainDate> = Order.mapInput(
  Order.Number,
  dayNumber,
)

/** Every day from `start` to `end`, both included. The ends may arrive in
 *  either order: a range picked right to left fills the same days. */
export const datesBetween = (
  start: PlainDate,
  end: PlainDate,
): ReadonlyArray<PlainDate> => {
  const low = Math.min(dayNumber(start), dayNumber(end))
  const high = Math.max(dayNumber(start), dayNumber(end))

  return Array.makeBy(high - low + 1, offset => dateFromDayNumber(low + offset))
}

const weekdayFormatter = new DateFormatter('en-GB', {
  weekday: 'short',
  timeZone: 'UTC',
})

const dayOfMonthFormatter = new DateFormatter('en-GB', {
  day: 'numeric',
  timeZone: 'UTC',
})

const monthDayFormatter = new DateFormatter('en-GB', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})

const monthNameFormatter = new DateFormatter('en-GB', {
  month: 'long',
  timeZone: 'UTC',
})

const monthYearFormatter = new DateFormatter('en-GB', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

const fullDateFormatter = new DateFormatter('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

const format = (formatter: DateFormatter, date: PlainDate): string =>
  formatter.format(date.toDate('UTC'))

export const weekdayLabel = (date: PlainDate): string =>
  format(weekdayFormatter, date)

export const dayOfMonthLabel = (date: PlainDate): string =>
  format(dayOfMonthFormatter, date)

export const monthDayLabel = (date: PlainDate): string =>
  format(monthDayFormatter, date)

export const monthNameLabel = (date: PlainDate): string =>
  format(monthNameFormatter, date)

export const monthYearLabel = (date: PlainDate): string =>
  format(monthYearFormatter, date)

export const fullDateLabel = (date: PlainDate): string =>
  format(fullDateFormatter, date)

const mondayOffset = (date: PlainDate): number =>
  (((dayNumber(date) + 3) % 7) + 7) % 7

export const monthWeeks = (
  year: number,
  month: number,
): ReadonlyArray<ReadonlyArray<PlainDate>> => {
  const first = new CalendarDate(year, month, 1)
  const last = first.add({ months: 1 }).subtract({ days: 1 })
  const gridStart = dayNumber(first) - mondayOffset(first)
  const gridEnd = dayNumber(last) + (6 - mondayOffset(last))
  const weekCount = Math.round((gridEnd - gridStart + 1) / 7)

  return Array.makeBy(weekCount, week =>
    Array.makeBy(7, day => dateFromDayNumber(gridStart + week * 7 + day)),
  )
}
