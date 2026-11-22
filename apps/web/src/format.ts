import {
  type PlainDate,
  dayOfMonthLabel,
  monthDayLabel,
  sameDay,
  weekdayLabel,
} from './domain'

export const plural = (
  count: number,
  singular: string,
  pluralForm: string,
): string => (count === 1 ? `1 ${singular}` : `${count} ${pluralForm}`)

export const windowLabel = (low: PlainDate, high: PlainDate): string => {
  if (sameDay(low, high)) {
    return `${weekdayLabel(low)} ${monthDayLabel(low)}`
  }

  return low.year === high.year && low.month === high.month
    ? `${dayOfMonthLabel(low)} – ${monthDayLabel(high)}`
    : `${monthDayLabel(low)} – ${monthDayLabel(high)}`
}
