import { Array, Option, Order, pipe } from 'effect'

export type MetricsRow = {
  readonly name: string
  readonly errors: ReadonlyArray<number>
  readonly coverage: ReadonlyArray<boolean>
}

export type LateRow = {
  readonly offset: number
  readonly open: number
  readonly errors: ReadonlyArray<number>
  readonly coverage: ReadonlyArray<boolean>
}

const mean = (values: ReadonlyArray<number>): number =>
  Array.reduce(values, 0, (total, value) => total + value) / values.length

const share = (
  values: ReadonlyArray<number>,
  predicate: (value: number) => boolean,
): number =>
  values.length === 0
    ? 0
    : Array.length(Array.filter(values, predicate)) / values.length

const fixed = (value: number, digits: number, width: number): string =>
  value.toFixed(digits).padStart(width)

const percent = (value: number, width: number): string =>
  `${(value * 100).toFixed(1)}%`.padStart(width)

const errorMetrics = (errors: ReadonlyArray<number>) => ({
  count: errors.length,
  mae: mean(pipe(errors, Array.map(Math.abs))),
  medianError: Array.isReadonlyArrayEmpty(errors)
    ? 0
    : pipe(errors, Array.map(Math.abs), values => {
        const sorted = Array.sort(values, Order.Number)
        return Option.getOrThrow(
          Array.get(sorted, Math.floor(sorted.length / 2)),
        )
      }),
  withinOne: share(errors, error => Math.abs(error) <= 1),
  withinTwo: share(errors, error => Math.abs(error) <= 2),
  withinThree: share(errors, error => Math.abs(error) <= 3),
})

const bandShare = (coverage: ReadonlyArray<boolean>): Option.Option<number> =>
  Array.isReadonlyArrayEmpty(coverage)
    ? Option.none()
    : Option.some(
        Array.length(Array.filter(coverage, Boolean)) / coverage.length,
      )

const METRICS_HEADER =
  'method                                     n     MAE  medAE     ±1     ±2     ±3  80% band'

const METRICS_RULE =
  '----------------------------------------------------------------------------------------'

export const formatMetricsTable = (rows: ReadonlyArray<MetricsRow>): string =>
  [
    METRICS_HEADER,
    METRICS_RULE,
    ...Array.map(rows, row => {
      const metrics = errorMetrics(row.errors)
      const band = Option.match(bandShare(row.coverage), {
        onNone: () => '—'.padStart(9),
        onSome: value => percent(value, 9),
      })

      return [
        row.name.padEnd(38),
        String(metrics.count).padStart(5),
        fixed(metrics.mae, 2, 8),
        fixed(metrics.medianError, 1, 7),
        percent(metrics.withinOne, 7),
        percent(metrics.withinTwo, 7),
        percent(metrics.withinThree, 7),
        band,
      ].join(' ')
    }),
  ].join('\n')

const LATE_HEADER =
  'checkpoint                       open   share    MAE     ±2  80% band'

const LATE_RULE =
  '-------------------------------------------------------------------------'

const checkpointLabel = (offset: number): string =>
  offset === 0 ? 'on the estimate' : `estimate +${offset} days`

export const formatLateTable = (
  rows: ReadonlyArray<LateRow>,
  totalPairs: number,
): string =>
  [
    LATE_HEADER,
    LATE_RULE,
    ...Array.map(rows, row => {
      const metrics = errorMetrics(row.errors)
      const band = Option.match(bandShare(row.coverage), {
        onNone: () => '—'.padStart(10),
        onSome: value => percent(value, 10),
      })

      return [
        checkpointLabel(row.offset).padEnd(32),
        String(row.open).padStart(4),
        percent(row.open / totalPairs, 7),
        fixed(metrics.mae, 2, 6),
        percent(metrics.withinTwo, 7),
        band,
      ].join(' ')
    }),
  ].join('\n')
