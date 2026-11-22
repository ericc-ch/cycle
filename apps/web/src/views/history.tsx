import {
  type DayLog,
  type Period,
  cycleGaps,
  datesBetween,
  dayNumber,
  flowAt,
  formatPlainDate,
  isLikelySkip,
  median,
  monthDayLabel,
  presentGaps,
  withoutLikelySkips,
} from '../domain'
import { plural } from '../format'
import { cn } from '../lib/utils'

type HistoryRow = {
  readonly id: string
  readonly period: Period
  readonly label: string
  readonly meta: string
  readonly note: string | null
}

const MAX_RUN_DOTS = 12

/** A period drawn in the app's own mark: a dot per day, spotting in violet
 *  and an unlogged day in grey. It is decoration; the label and the count
 *  carry the meaning. */
const DayRun = ({
  logs,
  period,
}: {
  readonly logs: ReadonlyArray<DayLog>
  readonly period: Period
}) => {
  const days = datesBetween(period.start, period.end)

  return (
    <span aria-hidden="true" className="flex items-center gap-0.5 self-center">
      {days.slice(0, MAX_RUN_DOTS).map(day => {
        const flow = flowAt(logs, day)

        return (
          <span
            key={formatPlainDate(day)}
            className={cn(
              'size-1 rounded-full',
              flow === 'Bleeding' && 'bg-bleeding',
              flow === 'Spotting' && 'bg-spotting',
              flow === null && 'bg-fg-2',
            )}
          />
        )
      })}
      {days.length > MAX_RUN_DOTS ? (
        <span className="text-xs leading-none text-fg-2">
          +{days.length - MAX_RUN_DOTS}
        </span>
      ) : null}
    </span>
  )
}

const historyRows = (
  periods: ReadonlyArray<Period>,
  gaps: ReadonlyArray<number | null>,
): ReadonlyArray<HistoryRow> => {
  const rows: HistoryRow[] = []

  periods.forEach((period, index) => {
    const days = dayNumber(period.end) - dayNumber(period.start) + 1
    const gap = gaps[index] ?? null
    const note =
      gap !== null && isLikelySkip(presentGaps(gaps.slice(0, index)), gap)
        ? 'Probably a period you did not log, so the estimate skips this gap.'
        : null

    rows.push({
      id: formatPlainDate(period.start),
      period,
      label: `${monthDayLabel(period.start)} – ${monthDayLabel(period.end)}`,
      meta: `${plural(days, 'day', 'days')} · ${
        gap === null ? '—' : `${gap} day cycle`
      }`,
      note,
    })
  })

  return rows.reverse()
}

export const HistoryView = ({
  logs,
  periods,
}: {
  readonly logs: ReadonlyArray<DayLog>
  readonly periods: ReadonlyArray<Period>
}) => {
  const gaps = cycleGaps(periods)
  const lengths = presentGaps(gaps)
  const recentLengths = withoutLikelySkips(lengths).slice(-6)
  const rows = historyRows(periods, gaps)

  return (
    <div className="flex flex-col gap-base">
      <div className="flex items-baseline justify-between gap-snug text-sm text-fg-1">
        <span>Periods</span>
        <span>
          {recentLengths.length === 0
            ? 'no complete cycles'
            : `${plural(lengths.length, 'cycle', 'cycles')} · median ${Math.round(median(recentLengths))} days`}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-fg-1">Nothing logged yet.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-snug p-0">
          {rows.map(row => (
            <li
              key={row.id}
              className="grid grid-cols-[auto_1fr_auto] items-baseline gap-snug rounded-lg border border-line bg-bg-1 p-base shadow-surface"
            >
              <DayRun logs={logs} period={row.period} />
              <span className="font-medium text-fg-0">{row.label}</span>
              <span className="text-end text-sm text-fg-1">{row.meta}</span>
              {row.note === null ? null : (
                <span className="col-span-3 text-sm text-fg-1">{row.note}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
