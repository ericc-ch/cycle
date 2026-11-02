import { Array, Option, Order, Schema, pipe } from 'effect'

export const CycleRow = Schema.Struct({
  clientId: Schema.String,
  cycleNumber: Schema.Number,
  lengthDays: Schema.Number,
})
export type CycleRow = typeof CycleRow.Type

export type TrainingPair = {
  readonly history: ReadonlyArray<number>
  readonly actual: number
}

const CLIENT_COLUMN = 'ClientID'
const CYCLE_COLUMN = 'CycleNumber'
const LENGTH_COLUMN = 'LengthofCycle'

const PLAUSIBLE_MIN_DAYS = 15
const PLAUSIBLE_MAX_DAYS = 90

const headerIndex = (
  header: ReadonlyArray<string>,
  column: string,
): Option.Option<number> =>
  Array.findFirstIndex(header, field => field.trim() === column)

const parseLine = (
  line: string,
  clientIndex: number,
  cycleIndex: number,
  lengthIndex: number,
): Option.Option<CycleRow> => {
  const fields = line.split(',')

  const maybeRow = Option.map(
    Option.all([
      Option.fromNullishOr(fields[clientIndex]),
      Option.fromNullishOr(fields[cycleIndex]),
      Option.fromNullishOr(fields[lengthIndex]),
    ]),
    ([clientId, cycleNumber, lengthDays]) => ({
      clientId: clientId.trim(),
      cycleNumber: Number(cycleNumber),
      lengthDays: Number(lengthDays),
    }),
  )

  return Option.filter(
    maybeRow,
    row =>
      row.clientId !== '' &&
      Number.isFinite(row.cycleNumber) &&
      Number.isFinite(row.lengthDays),
  )
}

const parseBody = (
  headerLine: string,
  lines: ReadonlyArray<string>,
): ReadonlyArray<CycleRow> => {
  const header = headerLine.replace(/^\uFEFF/, '').split(',')

  const maybeIndexes = Option.all([
    headerIndex(header, CLIENT_COLUMN),
    headerIndex(header, CYCLE_COLUMN),
    headerIndex(header, LENGTH_COLUMN),
  ])

  return Option.match(maybeIndexes, {
    onNone: () => [],
    onSome: ([clientIndex, cycleIndex, lengthIndex]) =>
      pipe(
        lines,
        Array.map(line =>
          parseLine(line, clientIndex, cycleIndex, lengthIndex),
        ),
        Array.getSomes,
      ),
  })
}

export const parseCycleCsv = (text: string): ReadonlyArray<CycleRow> => {
  const lines = Array.filter(text.split(/\r?\n/), line => line.trim() !== '')

  return Option.match(Array.head(lines), {
    onNone: () => [],
    onSome: headerLine => parseBody(headerLine, lines.slice(1)),
  })
}

const isPlausible = (row: CycleRow): boolean =>
  row.lengthDays >= PLAUSIBLE_MIN_DAYS && row.lengthDays <= PLAUSIBLE_MAX_DAYS

const groupByClient = (
  rows: ReadonlyArray<CycleRow>,
): ReadonlyArray<ReadonlyArray<CycleRow>> =>
  Array.fromIterable(
    Array.reduce(
      rows,
      new Map<string, ReadonlyArray<CycleRow>>(),
      (groups, row) => {
        const empty: ReadonlyArray<CycleRow> = []
        const existing = Option.getOrElse(
          Option.fromNullishOr(groups.get(row.clientId)),
          () => empty,
        )
        groups.set(row.clientId, Array.append(existing, row))
        return groups
      },
    ).values(),
  )

const orderedCycles = (
  rows: ReadonlyArray<CycleRow>,
): ReadonlyArray<CycleRow> => {
  const plausible = Array.filter(rows, isPlausible)

  return Array.sort(
    plausible,
    Order.mapInput(Order.Number, (row: CycleRow) => row.cycleNumber),
  )
}

export const trainingPairs = (
  rows: ReadonlyArray<CycleRow>,
): ReadonlyArray<TrainingPair> =>
  pipe(
    groupByClient(rows),
    Array.flatMap(group => {
      const ordered = orderedCycles(group)

      return Array.flatMap(ordered, (row, index): ReadonlyArray<TrainingPair> =>
        Option.match(Array.get(ordered, index - 1), {
          onNone: () => [],
          onSome: previous =>
            row.cycleNumber === previous.cycleNumber + 1
              ? [
                  {
                    history: pipe(
                      ordered.slice(0, index),
                      Array.map(cycle => cycle.lengthDays),
                    ),
                    actual: row.lengthDays,
                  },
                ]
              : [],
        }),
      )
    }),
  )

export const clientCount = (rows: ReadonlyArray<CycleRow>): number =>
  Array.length(groupByClient(rows))

export const cycleCount = (rows: ReadonlyArray<CycleRow>): number =>
  Array.length(Array.filter(rows, isPlausible))

export const orderedGroups = (
  rows: ReadonlyArray<CycleRow>,
): ReadonlyArray<ReadonlyArray<CycleRow>> =>
  pipe(groupByClient(rows), Array.map(orderedCycles))
