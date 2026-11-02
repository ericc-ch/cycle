import { Array, Console, Effect, FileSystem, Option, pipe } from 'effect'

import { NodeRuntime, NodeServices } from '@effect/platform-node'

import { median } from '../predict'
import {
  type CycleRow,
  type TrainingPair,
  clientCount,
  cycleCount,
  orderedGroups,
  parseCycleCsv,
  trainingPairs,
} from './dataset'
import {
  type Method,
  appPredictor,
  constantPredictor,
  meanPredictor,
  medianPredictor,
} from './predictors'
import {
  type LateRow,
  type MetricsRow,
  formatLateTable,
  formatMetricsTable,
} from './report'

const DATASET_ARGUMENT_INDEX = 2
const DEFAULT_DATASET_PATH = 'data/marquette-cycles.csv'
const LATE_OFFSETS = [0, 2, 4, 7, 10]
const MIN_CYCLES_FOR_SPREAD = 3

const sampleSpread = (values: ReadonlyArray<number>): number => {
  if (values.length < 2) {
    return 0
  }

  const average =
    pipe(
      values,
      Array.reduce(0, (total, value) => total + value),
    ) / values.length

  const squares = pipe(
    values,
    Array.reduce(0, (total, value) => total + (value - average) ** 2),
  )

  return Math.sqrt(squares / (values.length - 1))
}

const pooledSpread = (rows: ReadonlyArray<CycleRow>): number => {
  const spreads = pipe(
    orderedGroups(rows),
    Array.map(group => {
      const lengths = Array.map(group, cycle => cycle.lengthDays)

      return lengths.length >= MIN_CYCLES_FOR_SPREAD
        ? Option.some(sampleSpread(lengths))
        : Option.none()
    }),
    Array.getSomes,
  )

  return Array.isReadonlyArrayEmpty(spreads) ? 0 : median(spreads)
}

const isCovered = (
  prediction: Option.Option<{ readonly low: number; readonly high: number }>,
  actual: number,
): Option.Option<boolean> =>
  Option.map(prediction, band => actual >= band.low && actual <= band.high)

const evaluate = (
  method: Method,
  pairs: ReadonlyArray<TrainingPair>,
): MetricsRow => {
  const rows = pipe(
    pairs,
    Array.map(pair =>
      Option.map(method.predict(pair.history), prediction => ({
        error: prediction.point - pair.actual,
        covered: isCovered(prediction.band, pair.actual),
      })),
    ),
    Array.getSomes,
  )

  return {
    name: method.name,
    errors: Array.map(rows, row => row.error),
    coverage: Array.getSomes(Array.map(rows, row => row.covered)),
  }
}

const evaluateLate = (
  pairs: ReadonlyArray<TrainingPair>,
  offset: number,
): LateRow => {
  const rows = pipe(
    pairs,
    Array.map(pair =>
      Option.flatMap(appPredictor.predict(pair.history), baseline => {
        const elapsed = Math.round(baseline.point) + offset

        return pair.actual < elapsed
          ? Option.none()
          : Option.map(
              appPredictor.predictAt(pair.history, elapsed),
              prediction => ({
                error: prediction.point - pair.actual,
                covered: Option.match(prediction.band, {
                  onNone: () => false,
                  onSome: band =>
                    pair.actual >= band.low && pair.actual <= band.high,
                }),
              }),
            )
      }),
    ),
    Array.getSomes,
  )

  return {
    offset,
    open: rows.length,
    errors: Array.map(rows, row => row.error),
    coverage: Array.map(rows, row => row.covered),
  }
}

const methods: ReadonlyArray<Method> = [
  constantPredictor,
  meanPredictor('mean of last 3 (Mooneva)', 3, 3),
  meanPredictor('mean of last 5 (Mensinator)', 5, 2),
  meanPredictor('mean of all previous (drip)', 0, 3),
  medianPredictor('median of last 6', 6),
  appPredictor,
]

/** A benchmark, not a method: an oracle that already knows each woman's
 *  whole-history median. It bounds what any online predictor can still win,
 *  because the rest is the spread of her own cycles. */
const oracleErrors = (rows: ReadonlyArray<CycleRow>): ReadonlyArray<number> =>
  pipe(
    orderedGroups(rows),
    Array.flatMap(group => {
      const centre = median(Array.map(group, cycle => cycle.lengthDays))

      return Array.flatMap(group, (cycle, index) =>
        index === 0 ? [] : [cycle.lengthDays - centre],
      )
    }),
  )

const meanAbsolute = (errors: ReadonlyArray<number>): number =>
  Array.isReadonlyArrayEmpty(errors)
    ? 0
    : pipe(
        errors,
        Array.reduce(0, (total, error) => total + Math.abs(error)),
        total => total / errors.length,
      )

const medianAbsolute = (errors: ReadonlyArray<number>): number =>
  Array.isReadonlyArrayEmpty(errors)
    ? 0
    : median(pipe(errors, Array.map(Math.abs)))

const main = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem
  const datasetPath =
    process.argv[DATASET_ARGUMENT_INDEX] ?? DEFAULT_DATASET_PATH

  const exists = yield* fileSystem.exists(datasetPath)

  if (!exists) {
    yield* Console.error(
      `No dataset at ${datasetPath}.\nRun: nub scripts/fetch-dataset.ts`,
    )
    return
  }

  const text = yield* fileSystem.readFileString(datasetPath)
  const rows = parseCycleCsv(text)
  const pairs = trainingPairs(rows)

  yield* Console.log('')
  yield* Console.log(
    `${cycleCount(rows)} cycles from ${clientCount(rows)} women, ${pairs.length} usable cycle-to-cycle pairs`,
  )
  yield* Console.log(
    `median within-woman spread here: ${pooledSpread(rows).toFixed(2)} days. The app ships a wider prior on purpose.`,
  )
  yield* Console.log('')
  yield* Console.log(
    formatMetricsTable(Array.map(methods, method => evaluate(method, pairs))),
  )
  yield* Console.log('')
  yield* Console.log(
    `floor: an oracle that already knew each woman's median scores MAE ${meanAbsolute(oracleErrors(rows)).toFixed(2)} (medAE ${medianAbsolute(oracleErrors(rows)).toFixed(1)}). The gap from the app row to that is all a better model could win.`,
  )
  yield* Console.log('')
  yield* Console.log(
    'app method, prediction made while the cycle is still open (only cycles that got that far):',
  )
  yield* Console.log(
    formatLateTable(
      Array.map(LATE_OFFSETS, offset => evaluateLate(pairs, offset)),
      pairs.length,
    ),
  )
  yield* Console.log('')
})

NodeRuntime.runMain(main.pipe(Effect.provide(NodeServices.layer)))
