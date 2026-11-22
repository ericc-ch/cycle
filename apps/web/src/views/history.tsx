import {
  type Period,
  cycleGaps,
  dayNumber,
  formatPlainDate,
  isLikelySkip,
  median,
  monthDayLabel,
  presentGaps,
  withoutLikelySkips,
} from '../domain'
import { plural } from '../format'

type HistoryRow = {
  readonly id: string
  readonly label: string
  readonly meta: string
  readonly note: string | null
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
  periods,
}: {
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
              className="grid grid-cols-[1fr_auto] items-baseline gap-snug rounded-lg border border-line bg-bg-1 p-base shadow-surface"
            >
              <span className="font-medium text-fg-0">{row.label}</span>
              <span className="text-end text-sm text-fg-1">{row.meta}</span>
              {row.note === null ? null : (
                <span className="col-span-2 text-sm text-fg-1">{row.note}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
