import { Array, Option, Order, Schema, pipe } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'

import { type DateKey, formatDayNumber, parseDayNumber } from './date'
import { type Period, cycleLengths, latestPeriod } from './period'

export const Confidence = Schema.Literals(['Rough', 'Fair', 'Good'])
export type Confidence = typeof Confidence.Type

export const Window = Schema.Struct({
  low: Schema.String,
  high: Schema.String,
  mostLikely: Schema.String,
})
export type Window = typeof Window.Type

export const CycleState = defineTaggedUnion({
  NoCycles: {},
  Expected: {
    window: Window,
    daysUntil: Schema.Number,
    confidence: Confidence,
  },
  Late: {
    window: Window,
    daysLate: Schema.Number,
    confidence: Confidence,
  },
  Overdue: {
    daysLate: Schema.Number,
    confidence: Confidence,
  },
})
export type CycleState = typeof CycleState.Type

export type PredictorOptions = {
  readonly populationMeanDays: number
  readonly spreadFloorDays: number
  readonly coldStartSpreadDays: number
  readonly bandZ: number
}

export const defaultPredictorOptions: PredictorOptions = {
  populationMeanDays: 29,
  spreadFloorDays: 2.3,
  coldStartSpreadDays: 4,
  bandZ: 1.2816,
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
    centreDays: median(recent),
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

  const { centreDays, spreadDays } = estimate(lengths, options)
  const elapsed = Math.max(0, elapsedDays)

  return Option.some({
    centreDays,
    spreadDays,
    likelyDay: Math.round(truncatedMean(centreDays, spreadDays, elapsed)),
    lowDay: Math.floor(truncatedQuantile(centreDays, spreadDays, elapsed, 0.1)),
    highDay: Math.ceil(truncatedQuantile(centreDays, spreadDays, elapsed, 0.9)),
    cyclesCounted: lengths.length,
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
  low: formatDayNumber(startDay + forecasted.lowDay),
  high: formatDayNumber(startDay + forecasted.highDay),
  mostLikely: formatDayNumber(startDay + forecasted.likelyDay),
})

export const stateFor = (
  periods: ReadonlyArray<Period>,
  today: DateKey,
  options: PredictorOptions = defaultPredictorOptions,
): CycleState => {
  const maybeToday = parseDayNumber(today)

  const maybeState = Option.flatMap(latestPeriod(periods), period =>
    Option.flatMap(maybeToday, todayNumber =>
      Option.flatMap(parseDayNumber(period.start), startNumber => {
        const lengths = cycleLengths(periods)
        const elapsed = Math.max(1, todayNumber - startNumber)

        return Option.map(forecast(lengths, elapsed, options), forecasted => {
          const confidence = confidenceFor(forecasted.cyclesCounted)
          const window = windowFromForecast(forecasted, startNumber)
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
      }),
    ),
  )

  return Option.getOrElse(maybeState, () => CycleState.NoCycles())
}

export const cycleDayFor = (
  periods: ReadonlyArray<Period>,
  today: DateKey,
): Option.Option<number> =>
  Option.flatMap(parseDayNumber(today), todayNumber =>
    Option.flatMap(latestPeriod(periods), period =>
      Option.map(parseDayNumber(period.start), startNumber =>
        Math.max(1, todayNumber - startNumber + 1),
      ),
    ),
  )
