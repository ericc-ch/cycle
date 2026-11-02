import { Option, Order } from 'effect'

const MILLISECONDS_PER_DAY = 86_400_000
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export type DateKey = string

export const parseDayNumber = (key: DateKey): Option.Option<number> => {
  if (!DATE_KEY_PATTERN.test(key)) {
    return Option.none()
  }

  const year = Number(key.slice(0, 4))
  const month = Number(key.slice(5, 7))
  const day = Number(key.slice(8, 10))
  const millis = Date.UTC(year, month - 1, day)
  const date = new Date(millis)

  const isRealDate =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day

  return isRealDate ? Option.some(millis / MILLISECONDS_PER_DAY) : Option.none()
}

export const formatDayNumber = (dayNumber: number): DateKey =>
  new Date(Math.round(dayNumber) * MILLISECONDS_PER_DAY)
    .toISOString()
    .slice(0, 10)

export const shiftDateKey = (
  key: DateKey,
  days: number,
): Option.Option<DateKey> =>
  Option.map(parseDayNumber(key), dayNumber =>
    formatDayNumber(dayNumber + days),
  )

export const dateKeyFromMillis = (millis: number): DateKey => {
  const date = new Date(millis)
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export type DateParts = Readonly<{
  year: number
  month: number
  day: number
}>

/** Splits a date key into the parts a calendar wants. `None` for a key that
 *  is not a real date, same rule as `parseDayNumber`. */
export const partsFromDateKey = (key: DateKey): Option.Option<DateParts> =>
  Option.map(parseDayNumber(key), dayNumber => {
    const date = new Date(dayNumber * MILLISECONDS_PER_DAY)

    return {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
    }
  })

export const dateKeyFromParts = ({ year, month, day }: DateParts): DateKey =>
  `${year}-${`${month}`.padStart(2, '0')}-${`${day}`.padStart(2, '0')}`

export const weekdayLabel = (dayNumber: number): string =>
  new Date(dayNumber * MILLISECONDS_PER_DAY).toLocaleDateString('en-GB', {
    weekday: 'short',
    timeZone: 'UTC',
  })

export const dayOfMonthLabel = (dayNumber: number): string =>
  new Date(dayNumber * MILLISECONDS_PER_DAY).toLocaleDateString('en-GB', {
    day: 'numeric',
    timeZone: 'UTC',
  })

export const monthDayLabel = (dayNumber: number): string =>
  new Date(dayNumber * MILLISECONDS_PER_DAY).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })

export const dateKeyOrder: Order.Order<DateKey> = Order.String
