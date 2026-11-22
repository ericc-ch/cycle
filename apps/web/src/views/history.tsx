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
  readonly year: number
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
    <span aria-hidden="true" className="flex items-center gap-0.5">
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
    const previous = index > 0 ? periods[index - 1] : undefined
    const rawGap =
      previous === undefined
        ? null
        : dayNumber(period.start) - dayNumber(previous.start)
    const note =
      gap !== null && isLikelySkip(presentGaps(gaps.slice(0, index)), gap)
        ? 'Probably a period you did not log, so the estimate skips this gap.'
        : null
    const daysLabel = plural(days, 'day', 'days')
    const meta =
      gap !== null
        ? `${daysLabel} · ${gap} day cycle`
        : rawGap !== null
          ? `${daysLabel} · ${rawGap} day gap`
          : daysLabel

    rows.push({
      id: formatPlainDate(period.start),
      year: period.start.year,
      period,
      label: `${monthDayLabel(period.start)} – ${monthDayLabel(period.end)}`,
      meta,
      note,
    })
  })

  return rows.reverse()
}

const groupByYear = (
  rows: ReadonlyArray<HistoryRow>,
): ReadonlyArray<{
  readonly year: number
  readonly rows: ReadonlyArray<HistoryRow>
}> => {
  const groups: Array<{ readonly year: number; rows: HistoryRow[] }> = []

  for (const row of rows) {
    const last = groups.at(-1)

    if (last !== undefined && last.year === row.year) {
      last.rows.push(row)
    } else {
      groups.push({ year: row.year, rows: [row] })
    }
  }

  return groups
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
  const yearGroups = groupByYear(rows)

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

      {yearGroups.length === 0 ? (
        <p className="text-sm text-fg-1">Nothing logged yet.</p>
      ) : (
        <div className="flex flex-col gap-base">
          {yearGroups.map(group => (
            <section key={group.year} className="flex flex-col gap-snug">
              <p className="text-xs font-medium text-fg-1">{group.year}</p>
              <ul className="m-0 flex list-none flex-col gap-snug p-0">
                {group.rows.map(row => (
                  <li
                    key={row.id}
                    className="flex flex-col gap-snug rounded-lg border border-line bg-bg-1 p-base shadow-surface"
                  >
                    <div className="flex items-baseline justify-between gap-snug">
                      <span className="font-medium text-fg-0">{row.label}</span>
                      <span className="text-end text-sm text-fg-1">
                        {row.meta}
                      </span>
                    </div>
                    <DayRun logs={logs} period={row.period} />
                    {row.note === null ? null : (
                      <span className="text-sm text-fg-1">{row.note}</span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
