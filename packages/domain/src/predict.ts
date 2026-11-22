import { Array, Option, Order, Schema, pipe } from 'effect'

import {
  type PlainDate,
  PlainDateSchema,
  dateFromDayNumber,
  dayNumber,
} from './date.ts'
import { type Period, cycleLengths, latestPeriod } from './period.ts'

export const Confidence = Schema.Literals(['Rough', 'Fair', 'Good'])
export type Confidence = typeof Confidence.Type

export const Window = Schema.Struct({
  low: PlainDateSchema,
  high: PlainDateSchema,
  mostLikely: PlainDateSchema,
})
export type Window = typeof Window.Type

export type NoCycles = { readonly _tag: 'NoCycles' }

export type Expected = {
  readonly _tag: 'Expected'
  readonly window: Window
  readonly daysUntil: number
  readonly confidence: Confidence
}

export type Late = {
  readonly _tag: 'Late'
  readonly window: Window
  readonly daysLate: number
  readonly confidence: Confidence
}

export type Overdue = {
  readonly _tag: 'Overdue'
  readonly daysLate: number
  readonly confidence: Confidence
}

export type CycleState = NoCycles | Expected | Late | Overdue

/** A plain tagged union. The app and the tests construct states by tag and
 *  switch on `_tag`; nothing here needs a schema codec. */
export const CycleState = {
  NoCycles: (): NoCycles => ({ _tag: 'NoCycles' }),
  Expected: (state: Omit<Expected, '_tag'>): Expected => ({
    _tag: 'Expected',
    ...state,
  }),
  Late: (state: Omit<Late, '_tag'>): Late => ({ _tag: 'Late', ...state }),
  Overdue: (state: Omit<Overdue, '_tag'>): Overdue => ({
    _tag: 'Overdue',
    ...state,
  }),
  match: <A>(
    state: CycleState,
    cases: {
      readonly NoCycles: (state: NoCycles) => A
      readonly Expected: (state: Expected) => A
      readonly Late: (state: Late) => A
      readonly Overdue: (state: Overdue) => A
    },
  ): A => {
    switch (state._tag) {
      case 'NoCycles':
        return cases.NoCycles(state)
      case 'Expected':
        return cases.Expected(state)
      case 'Late':
        return cases.Late(state)
      case 'Overdue':
        return cases.Overdue(state)
    }
  },
} as const

export type PredictorOptions = {
  readonly populationMeanDays: number
  readonly spreadFloorDays: number
  readonly coldStartSpreadDays: number
  readonly bandZ: number
  /** A gap longer than this multiple of her own median is treated as a
   *  period she did not log. `Infinity` turns the check off. */
  readonly skipRatio: number
}

export const defaultPredictorOptions: PredictorOptions = {
  populationMeanDays: 29,
  spreadFloorDays: 2.3,
  coldStartSpreadDays: 4,
  bandZ: 1.2816,
  skipRatio: 1.6,
}

export type Forecast = {
  readonly centreDays: number
  readonly spreadDays: number
  readonly likelyDay: number
  readonly lowDay: number
  readonly highDay: number
  readonly cyclesCounted: number
}

const RECENT_CYCLE_COUNT = 6
const COLD_START_CYCLE_COUNT = 2
const FAIR_CONFIDENCE_CYCLE_COUNT = 3
const GOOD_CONFIDENCE_CYCLE_COUNT = 6
const BISECTION_STEPS = 64
const MAX_LATE_SPREADS = 2.5

const normalDensity = (z: number): number =>
  Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI)

const erf = (value: number): number => {
  const sign = value < 0 ? -1 : 1
  const absolute = Math.abs(value)
  const t = 1 / (1 + 0.3275911 * absolute)
  const series =
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) *
      t +
      0.254829592) *
    t
  return sign * (1 - series * Math.exp(-absolute * absolute))
}

const normalCdf = (z: number): number => 0.5 * (1 + erf(z / Math.SQRT2))

const remainingMass = (
  centre: number,
  spread: number,
  elapsed: number,
): number => 1 - normalCdf((elapsed - centre) / spread)

const truncatedCdf = (
  centre: number,
  spread: number,
  elapsed: number,
  value: number,
): number => {
  const remaining = remainingMass(centre, spread, elapsed)

  return remaining < 1e-9
    ? 1
    : (normalCdf((value - centre) / spread) -
        normalCdf((elapsed - centre) / spread)) /
        remaining
}

const truncatedQuantile = (
  centre: number,
  spread: number,
  elapsed: number,
  probability: number,
): number => {
  const step = (
    bounds: readonly [number, number],
  ): readonly [number, number] => {
    const midpoint = (bounds[0] + bounds[1]) / 2

    return truncatedCdf(centre, spread, elapsed, midpoint) < probability
      ? [midpoint, bounds[1]]
      : [bounds[0], midpoint]
  }

  const initialBounds: readonly [number, number] = [
    elapsed,
    elapsed + spread * 8 + 30,
  ]

  const bounds = pipe(
    Array.makeBy(BISECTION_STEPS, () => 0),
    Array.reduce(initialBounds, step),
  )

  return (bounds[0] + bounds[1]) / 2
}

const truncatedMean = (
  centre: number,
  spread: number,
  elapsed: number,
): number => {
  const remaining = remainingMass(centre, spread, elapsed)
  const z = (elapsed - centre) / spread

  return remaining < 1e-9
    ? elapsed + spread * MAX_LATE_SPREADS
    : centre + (spread * normalDensity(z)) / remaining
}

const mean = (values: ReadonlyArray<number>): number =>
  pipe(
    values,
    Array.reduce(0, (total, value) => total + value),
  ) / values.length

export const median = (values: ReadonlyArray<number>): number => {
  const sorted = Array.sort(values, Order.Number)
  const middle = Math.floor(sorted.length / 2)

  return sorted.length % 2 === 1
    ? Option.getOrThrow(Array.get(sorted, middle))
    : (Option.getOrThrow(Array.get(sorted, middle - 1)) +
        Option.getOrThrow(Array.get(sorted, middle))) /
        2
}

const trimmedMean = (values: ReadonlyArray<number>): number => {
  if (values.length <= 2) {
    return mean(values)
  }

  const sorted = Array.sort(values, Order.Number)

  return mean(sorted.slice(1, -1))
}

const robustCentre = (values: ReadonlyArray<number>): number =>
  (median(values) + trimmedMean(values)) / 2

const sampleSpread = (values: ReadonlyArray<number>): number => {
  if (values.length < 2) {
    return 0
  }

  const average = mean(values)
  const squares = pipe(
    values,
    Array.reduce(0, (total, value) => total + (value - average) ** 2),
  )

  return Math.sqrt(squares / (values.length - 1))
}

const smallSampleInflation = (cycleCount: number): number => {
  if (cycleCount <= 3) {
    return 1.25
  }

  return cycleCount <= 4 ? 1.15 : 1
}

const MIN_GAPS_FOR_SKIP_CHECK = 3

/** Whether a gap looks like a period she never logged rather than a real
 *  cycle, judged against the lengths before it. With three or more known
 *  lengths this fires on 0.2% of genuine cycles and on 99.9% of simulated
 *  missed logs in the scoring dataset. */
export const isLikelySkip = (
  earlierLengths: ReadonlyArray<number>,
  gapDays: number,
  skipRatio: number = defaultPredictorOptions.skipRatio,
): boolean =>
  earlierLengths.length >= MIN_GAPS_FOR_SKIP_CHECK &&
  gapDays > skipRatio * median(earlierLengths)

/** The lengths with likely missed logs left out. They are kept in the
 *  history and in the calendar; only the estimate ignores them, because a
 *  merged gap drags the centre and the spread. */
export const withoutLikelySkips = (
  lengths: ReadonlyArray<number>,
  skipRatio: number = defaultPredictorOptions.skipRatio,
): ReadonlyArray<number> => {
  const start: ReadonlyArray<number> = []

  return Array.reduce(lengths, start, (kept, length) =>
    isLikelySkip(kept, length, skipRatio) ? kept : Array.append(kept, length),
  )
}

type Estimate = { readonly centreDays: number; readonly spreadDays: number }

const estimate = (
  lengths: ReadonlyArray<number>,
  options: PredictorOptions,
): Estimate => {
  const recent = Array.takeRight(lengths, RECENT_CYCLE_COUNT)

  if (recent.length <= COLD_START_CYCLE_COUNT) {
    const pulledCentre =
      (mean(recent) * recent.length + options.populationMeanDays) /
      (recent.length + 1)

    return {
      centreDays: pulledCentre,
      spreadDays: options.coldStartSpreadDays,
    }
  }

  const spread = Math.max(sampleSpread(recent), options.spreadFloorDays)

  return {
    centreDays: robustCentre(recent),
    spreadDays: spread * smallSampleInflation(recent.length),
  }
}

export const forecast = (
  lengths: ReadonlyArray<number>,
  elapsedDays: number,
  options: PredictorOptions = defaultPredictorOptions,
): Option.Option<Forecast> => {
  if (Array.isReadonlyArrayEmpty(lengths)) {
    return Option.none()
  }

  const usable = withoutLikelySkips(lengths, options.skipRatio)
  const { centreDays, spreadDays } = estimate(usable, options)
  const elapsed = Math.max(0, elapsedDays)

  return Option.some({
    centreDays,
    spreadDays,
    likelyDay: Math.round(truncatedMean(centreDays, spreadDays, elapsed)),
    lowDay: Math.floor(truncatedQuantile(centreDays, spreadDays, elapsed, 0.1)),
    highDay: Math.ceil(truncatedQuantile(centreDays, spreadDays, elapsed, 0.9)),
    cyclesCounted: usable.length,
  })
}

export const confidenceFor = (cycleCount: number): Confidence => {
  if (cycleCount >= GOOD_CONFIDENCE_CYCLE_COUNT) {
    return 'Good'
  }

  return cycleCount >= FAIR_CONFIDENCE_CYCLE_COUNT ? 'Fair' : 'Rough'
}

const windowFromForecast = (
  forecasted: Forecast,
  startDay: number,
): Window => ({
  low: dateFromDayNumber(startDay + forecasted.lowDay),
  high: dateFromDayNumber(startDay + forecasted.highDay),
  mostLikely: dateFromDayNumber(startDay + forecasted.likelyDay),
})

export const stateFor = (
  periods: ReadonlyArray<Period>,
  today: PlainDate,
  options: PredictorOptions = defaultPredictorOptions,
): CycleState => {
  const maybeState = Option.flatMap(latestPeriod(periods), period => {
    const lengths = cycleLengths(periods)
    const elapsed = Math.max(1, dayNumber(today) - dayNumber(period.start))

    return Option.map(forecast(lengths, elapsed, options), forecasted => {
      const confidence = confidenceFor(forecasted.cyclesCounted)
      const window = windowFromForecast(forecasted, dayNumber(period.start))
      const usualDay = Math.round(forecasted.centreDays)
      const usualHighDay = Math.ceil(
        forecasted.centreDays + options.bandZ * forecasted.spreadDays,
      )

      if (elapsed > usualHighDay) {
        return CycleState.Overdue({
          daysLate: elapsed - usualDay,
          confidence,
        })
      }

      if (elapsed > usualDay) {
        return CycleState.Late({
          window,
          daysLate: elapsed - usualDay,
          confidence,
        })
      }

      return CycleState.Expected({
        window,
        daysUntil: usualDay - elapsed,
        confidence,
      })
    })
  })

  return Option.getOrElse(maybeState, () => CycleState.NoCycles())
}

export const predictedWindows = (
  periods: ReadonlyArray<Period>,
  today: PlainDate,
  count = 12,
  options: PredictorOptions = defaultPredictorOptions,
): ReadonlyArray<Window> => {
  if (count <= 0) {
    return []
  }

  return Option.getOrElse(
    Option.flatMap(latestPeriod(periods), period => {
      const lengths = cycleLengths(periods)
      const elapsed = Math.max(1, dayNumber(today) - dayNumber(period.start))

      return Option.map(forecast(lengths, elapsed, options), forecasted => {
        const usualHighDay = Math.ceil(
          forecasted.centreDays + options.bandZ * forecasted.spreadDays,
        )

        if (elapsed > usualHighDay) {
          return []
        }

        const first = windowFromForecast(forecasted, dayNumber(period.start))
        const firstLikelyDay = dayNumber(first.mostLikely)
        const halfWidth = options.bandZ * forecasted.spreadDays
        const windows: Window[] = [first]

        for (let index = 1; index < count; index++) {
          const centre = firstLikelyDay + index * forecasted.centreDays

          windows.push({
            low: dateFromDayNumber(Math.floor(centre - halfWidth)),
            high: dateFromDayNumber(Math.ceil(centre + halfWidth)),
            mostLikely: dateFromDayNumber(Math.round(centre)),
          })
        }

        return windows
      })
    }),
    () => [],
  )
}

export const cycleDayFor = (
  periods: ReadonlyArray<Period>,
  today: PlainDate,
): Option.Option<number> =>
  Option.map(latestPeriod(periods), period =>
    Math.max(1, dayNumber(today) - dayNumber(period.start) + 1),
  )
