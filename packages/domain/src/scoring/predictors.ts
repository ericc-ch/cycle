import { Array, Option } from 'effect'

import { type Forecast, forecast, median } from '../predict'

export type Band = {
  readonly low: number
  readonly high: number
}

export type Prediction = {
  readonly point: number
  readonly band: Option.Option<Band>
}

export type Method = {
  readonly name: string
  readonly predict: (
    history: ReadonlyArray<number>,
  ) => Option.Option<Prediction>
}

export type TimedMethod = Method & {
  readonly predictAt: (
    history: ReadonlyArray<number>,
    elapsedDays: number,
  ) => Option.Option<Prediction>
}

const mean = (values: ReadonlyArray<number>): number =>
  Array.reduce(values, 0, (total, value) => total + value) / values.length

const toPrediction = (forecasted: Forecast): Prediction => ({
  point: forecasted.likelyDay,
  band: Option.some({ low: forecasted.lowDay, high: forecasted.highDay }),
})

export const appPredictor: TimedMethod = {
  name: 'app: median6 + prior + spread',
  predict: history => Option.map(forecast(history, 0), toPrediction),
  predictAt: (history, elapsedDays) =>
    Option.map(forecast(history, elapsedDays), toPrediction),
}

export const constantPredictor: Method = {
  name: 'always 29 (no personal data)',
  predict: history =>
    Array.isReadonlyArrayEmpty(history)
      ? Option.none()
      : Option.some({ point: 29, band: Option.none() }),
}

export const meanPredictor = (
  name: string,
  window: number,
  minimumCycles: number,
): Method => ({
  name,
  predict: history => {
    const recent = window === 0 ? history : Array.takeRight(history, window)

    return recent.length < minimumCycles
      ? Option.none()
      : Option.some({ point: mean(recent), band: Option.none() })
  },
})

export const medianPredictor = (name: string, window: number): Method => ({
  name,
  predict: history => {
    const recent = Array.takeRight(history, window)

    return Array.isReadonlyArrayEmpty(recent)
      ? Option.none()
      : Option.some({ point: median(recent), band: Option.none() })
  },
})
