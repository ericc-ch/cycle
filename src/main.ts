import { Array, Clock, Effect, Match, Option, Order, Schema } from 'effect'
import { KeyValueStore } from 'effect/persistence'
import { Command, Runtime, type Update } from 'foldkit'
import { Document, Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'

import { BrowserKeyValueStore } from '@effect/platform-browser'

import {
  type DateKey,
  dateKeyFromMillis,
  dateKeyOrder,
  dayOfMonthLabel,
  formatDayNumber,
  monthDayLabel,
  parseDayNumber,
  weekdayLabel,
} from './domain/date'
import {
  type DayLog as DayLogEntry,
  DayLog as DayLogSchema,
  type Flow,
  Flow as FlowSchema,
  type Period,
  cycleLengths,
  flowOn,
  isBleedingFlow,
  latestPeriod,
  logsSorted,
  periodsFrom,
} from './domain/period'
import {
  type CycleState,
  CycleState as CycleStateSchema,
  type Window,
  cycleDayFor,
  median,
  stateFor,
} from './domain/predict'

// CONSTANT

const LOGS_STORAGE_KEY = 'cycle.logs'
const DAYS_SHOWN = 14

// MODEL

const DayLogs = Schema.Array(DayLogSchema)

const DayLogsJsonString = Schema.fromJsonString(Schema.toCodecJson(DayLogs))

export const Model = Schema.Struct({
  logs: DayLogs,
  today: Schema.String,
  selectedDate: Schema.String,
  acknowledgedLateOn: Schema.Option(Schema.String),
})
export type Model = typeof Model.Type

// MESSAGE

export const Message = defineMessageUnion({
  SelectedDay: { date: Schema.String },
  LoggedFlow: { date: Schema.String, flow: FlowSchema },
  ClearedDay: { date: Schema.String },
  AcknowledgedLate: { date: Schema.String },
  SucceededSaveLogs: { logs: DayLogs },
  FailedSaveLogs: {},
})
export type Message = typeof Message.Type

// FLAGS

export const Flags = Schema.Struct({
  logs: Schema.Option(DayLogs),
  today: Schema.String,
})
export type Flags = typeof Flags.Type

// INIT

export const init: Runtime.ApplicationInit<Model, Message, Flags> = flags => ({
  model: {
    logs: Option.getOrElse(flags.logs, () => []),
    today: flags.today,
    selectedDate: flags.today,
    acknowledgedLateOn: Option.none(),
  },
})

// UPDATE

type UpdateReturn = Update.Return<Model, Message>

const upsertLog = (
  logs: ReadonlyArray<DayLogEntry>,
  date: DateKey,
  flow: Flow,
): ReadonlyArray<DayLogEntry> => {
  const withoutDate = Array.filter(logs, log => log.date !== date)
  const updated = Array.append(withoutDate, { date, flow })

  return Array.sort(
    updated,
    Order.mapInput(dateKeyOrder, (log: DayLogEntry) => log.date),
  )
}

export const update = (model: Model, message: Message) =>
  Message.match<UpdateReturn>(message, {
    SelectedDay: ({ date }) => ({
      model: modifyFields(model, {
        selectedDate: () => date,
      }),
    }),

    LoggedFlow: ({ date, flow }) => {
      const logs = upsertLog(model.logs, date, flow)

      return {
        model: modifyFields(model, {
          logs: () => logs,
          selectedDate: () => date,
        }),
        commands: [SaveLogs({ logs })],
      }
    },

    ClearedDay: ({ date }) => {
      const logs = Array.filter(model.logs, log => log.date !== date)

      return {
        model: modifyFields(model, {
          logs: () => logs,
        }),
        commands: [SaveLogs({ logs })],
      }
    },

    AcknowledgedLate: ({ date }) => ({
      model: modifyFields(model, {
        acknowledgedLateOn: () => Option.some(date),
      }),
    }),

    SucceededSaveLogs: ({ logs }) => ({
      model: modifyFields(model, {
        logs: () => logsSorted(logs),
      }),
    }),

    FailedSaveLogs: () => ({ model }),
  })

// COMMAND

export const SaveLogs = Command.define('SaveLogs', {
  args: { logs: DayLogs },
  messages: [Message.SucceededSaveLogs, Message.FailedSaveLogs],
  execute: ({ logs }) =>
    Effect.gen(function* () {
      const store = yield* KeyValueStore.KeyValueStore
      const encodedLogs = yield* Schema.encodeEffect(DayLogsJsonString)(logs)
      yield* store.set(LOGS_STORAGE_KEY, encodedLogs)
      return Message.SucceededSaveLogs({ logs })
    }).pipe(
      Effect.catch(() => Effect.succeed(Message.FailedSaveLogs())),
      Effect.provide(BrowserKeyValueStore.layerLocalStorage),
    ),
})

// VIEW

const plural = (count: number, singular: string, pluralForm: string): string =>
  count === 1 ? `1 ${singular}` : `${count} ${pluralForm}`

const windowLabel = (window: Window): string =>
  Option.match(
    Option.all([parseDayNumber(window.low), parseDayNumber(window.high)]),
    {
      onNone: () => 'in a few days',
      onSome: ([low, high]) =>
        window.low.slice(0, 7) === window.high.slice(0, 7)
          ? `${weekdayLabel(low)} ${dayOfMonthLabel(low)} – ${weekdayLabel(high)} ${dayOfMonthLabel(high)}`
          : `${monthDayLabel(low)} – ${monthDayLabel(high)}`,
    },
  )

const dateLabel = (key: DateKey): string =>
  Option.match(parseDayNumber(key), {
    onNone: () => 'soon',
    onSome: dayNumber =>
      `${weekdayLabel(dayNumber)} ${dayOfMonthLabel(dayNumber)}`,
  })

const flowLabel = (flow: Flow): string =>
  Match.value(flow).pipe(
    Match.when('Spotting', () => 'spotting'),
    Match.when('Light', () => 'light'),
    Match.when('Medium', () => 'medium'),
    Match.when('Heavy', () => 'heavy'),
    Match.exhaustive,
  )

const flowBarClassName = (maybeFlow: Option.Option<Flow>): string =>
  Option.match(maybeFlow, {
    onNone: () => 'bg-transparent',
    onSome: flow =>
      Match.value(flow).pipe(
        Match.when('Spotting', () => 'bg-rose-200'),
        Match.when('Light', () => 'bg-rose-300'),
        Match.when('Medium', () => 'bg-rose-500'),
        Match.when('Heavy', () => 'bg-rose-700'),
        Match.exhaustive,
      ),
  })

type StatusCopy = {
  readonly headline: string
  readonly detail: string
  readonly hint: string
}

const statusCopy = (
  state: CycleState,
  maybeCycleDay: Option.Option<number>,
  maybeTodayFlow: Option.Option<Flow>,
  hasPeriods: boolean,
): StatusCopy => {
  const day = Option.match(maybeCycleDay, {
    onNone: () => 'Day 1',
    onSome: value => `Day ${value}`,
  })

  if (!hasPeriods) {
    return {
      headline: 'Nothing logged yet',
      detail: 'Tap a day to log your period.',
      hint: '',
    }
  }

  const isBleedingToday = Option.exists(maybeTodayFlow, isBleedingFlow)

  if (isBleedingToday) {
    return {
      headline: day,
      detail: Option.match(maybeTodayFlow, {
        onNone: () => 'Bleeding',
        onSome: flow => `Bleeding · ${flowLabel(flow)}`,
      }),
      hint: '',
    }
  }

  return CycleStateSchema.match<StatusCopy>(state, {
    NoCycles: () => ({
      headline: day,
      detail: 'Log one more period and I can start guessing.',
      hint: '',
    }),

    Expected: ({ window, daysUntil, confidence }) => ({
      headline: day,
      detail:
        daysUntil <= 0
          ? `Period expected ${windowLabel(window)}`
          : `Period expected ${windowLabel(window)} · ${plural(daysUntil, 'day', 'days')}`,
      hint: confidence === 'Rough' ? 'rough estimate' : '',
    }),

    Late: ({ window, daysLate, confidence }) => ({
      headline: day,
      detail: `Expected by ${dateLabel(window.high)} · ${plural(daysLate, 'day', 'days')} later than usual`,
      hint: confidence === 'Rough' ? 'rough estimate' : '',
    }),

    Overdue: ({ daysLate }) => ({
      headline: day,
      detail: `${plural(daysLate, 'day', 'days')} later than usual`,
      hint: '',
    }),
  })
}

const dayCellView = (
  model: Model,
  dayNumber: number,
  h: HtmlBuilder<Message>,
): Html => {
  const date = formatDayNumber(dayNumber)
  const maybeFlow = flowOn(model.logs, date)
  const isSelected = date === model.selectedDate
  const isToday = date === model.today

  return h.keyed('button')(
    date,
    [
      h.OnClick(Message.SelectedDay({ date })),
      h.AriaLabel(
        `${weekdayLabel(dayNumber)} ${dayOfMonthLabel(dayNumber)}, ${Option.match(
          maybeFlow,
          {
            onNone: () => 'nothing logged',
            onSome: flowLabel,
          },
        )}`,
      ),
      h.AriaPressed(isSelected ? 'true' : 'false'),
      h.Class(
        [
          'flex h-14 flex-col items-center justify-center gap-1 rounded-lg transition',
          isSelected
            ? 'bg-white shadow-sm ring-1 ring-stone-300'
            : 'hover:bg-white/70',
          isToday ? 'font-semibold' : '',
        ].join(' '),
      ),
    ],
    [
      h.span(
        [h.Class('text-[10px] uppercase tracking-wide text-stone-400')],
        [weekdayLabel(dayNumber).slice(0, 1)],
      ),
      h.span([h.Class('text-sm text-stone-700')], [dayOfMonthLabel(dayNumber)]),
      h.div([h.Class(`h-1 w-4 rounded-full ${flowBarClassName(maybeFlow)}`)]),
    ],
  )
}

const dayStripView = (model: Model, h: HtmlBuilder<Message>): Html =>
  Option.match(parseDayNumber(model.today), {
    onNone: () => h.empty,
    onSome: todayNumber =>
      h.div(
        [h.Class('grid grid-cols-7 gap-1.5')],
        Array.map(
          Array.makeBy(
            DAYS_SHOWN,
            index => todayNumber - (DAYS_SHOWN - 1) + index,
          ),
          dayNumber => dayCellView(model, dayNumber, h),
        ),
      ),
  })

const flowOptionView = (
  model: Model,
  label: string,
  maybeFlow: Option.Option<Flow>,
  h: HtmlBuilder<Message>,
): Html => {
  const isCurrent = Option.match(maybeFlow, {
    onNone: () => Option.isNone(flowOn(model.logs, model.selectedDate)),
    onSome: flow =>
      Option.contains(flowOn(model.logs, model.selectedDate), flow),
  })

  return h.button(
    [
      h.OnClick(
        Option.match(maybeFlow, {
          onNone: () => Message.ClearedDay({ date: model.selectedDate }),
          onSome: flow =>
            Message.LoggedFlow({ date: model.selectedDate, flow }),
        }),
      ),
      h.AriaPressed(isCurrent ? 'true' : 'false'),
      h.Class(
        [
          'flex-1 rounded-lg border px-2 py-2 text-xs transition',
          isCurrent
            ? 'border-stone-300 bg-white shadow-sm text-stone-900'
            : 'border-transparent text-stone-500 hover:bg-white/70',
        ].join(' '),
      ),
    ],
    [label],
  )
}

const flowEditorView = (model: Model, h: HtmlBuilder<Message>): Html =>
  Option.match(parseDayNumber(model.selectedDate), {
    onNone: () => h.empty,
    onSome: selectedNumber => {
      const maybeCurrent = flowOn(model.logs, model.selectedDate)

      return h.div(
        [h.Class('flex flex-col gap-2 rounded-xl bg-stone-100 p-3')],
        [
          h.div(
            [h.Class('flex items-baseline justify-between px-1')],
            [
              h.span(
                [h.Class('text-sm font-medium text-stone-700')],
                [
                  `${weekdayLabel(selectedNumber)} ${dayOfMonthLabel(selectedNumber)}`,
                ],
              ),
              h.span(
                [h.Class('text-xs text-stone-400')],
                [
                  Option.match(maybeCurrent, {
                    onNone: () => 'nothing logged',
                    onSome: flowLabel,
                  }),
                ],
              ),
            ],
          ),
          h.div(
            [h.Class('flex gap-1')],
            [
              flowOptionView(model, 'None', Option.none(), h),
              flowOptionView(model, 'Spot', Option.some('Spotting'), h),
              flowOptionView(model, 'Light', Option.some('Light'), h),
              flowOptionView(model, 'Medium', Option.some('Medium'), h),
              flowOptionView(model, 'Heavy', Option.some('Heavy'), h),
            ],
          ),
        ],
      )
    },
  })

const statusCardView = (
  model: Model,
  periods: ReadonlyArray<Period>,
  state: CycleState,
  h: HtmlBuilder<Message>,
): Html => {
  const copy = statusCopy(
    state,
    cycleDayFor(periods, model.today),
    flowOn(model.logs, model.today),
    Array.isReadonlyArrayNonEmpty(periods),
  )

  return h.div(
    [
      h.Class('flex flex-col gap-1 rounded-xl bg-white p-5 shadow-sm'),
      h.Role('status'),
    ],
    [
      h.div(
        [h.Class('flex items-baseline justify-between')],
        [
          h.p(
            [h.Class('text-2xl font-semibold tracking-tight text-stone-900')],
            [copy.headline],
          ),
          copy.hint === ''
            ? h.empty
            : h.span([h.Class('text-xs text-stone-400')], [copy.hint]),
        ],
      ),
      h.p([h.Class('text-sm text-stone-600')], [copy.detail]),
    ],
  )
}

const overdueCardView = (
  model: Model,
  state: CycleState,
  h: HtmlBuilder<Message>,
): Html =>
  CycleStateSchema.match(state, {
    Overdue: ({ daysLate }) => {
      const isAcknowledged = Option.contains(
        model.acknowledgedLateOn,
        model.today,
      )

      return isAcknowledged
        ? h.p(
            [h.Class('px-1 text-xs text-stone-400')],
            [
              'Counting days without alarm. Tap a day above if you find the missing period later.',
            ],
          )
        : h.div(
            [
              h.Class(
                'flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4',
              ),
            ],
            [
              h.p(
                [h.Class('text-sm text-amber-900')],
                [
                  `${plural(daysLate, 'day', 'days')} later than usual. That happens. Two likely reasons: a period you did not log, or a late one.`,
                ],
              ),
              h.button(
                [
                  h.OnClick(Message.AcknowledgedLate({ date: model.today })),
                  h.Class(
                    'self-start rounded-lg bg-amber-900 px-3 py-1.5 text-xs font-medium text-amber-50 hover:bg-amber-800',
                  ),
                ],
                ["It's just late"],
              ),
            ],
          )
    },
    Expected: () => h.empty,
    Late: () => h.empty,
    NoCycles: () => h.empty,
  })

const lastPeriodView = (
  periods: ReadonlyArray<Period>,
  h: HtmlBuilder<Message>,
): Html =>
  Option.match(latestPeriod(periods), {
    onNone: () => h.empty,
    onSome: period =>
      Option.match(
        Option.all([parseDayNumber(period.start), parseDayNumber(period.end)]),
        {
          onNone: () => h.empty,
          onSome: ([start, end]) =>
            h.p(
              [h.Class('text-xs text-stone-400')],
              [`Last period ${monthDayLabel(start)} – ${monthDayLabel(end)}`],
            ),
        },
      ),
  })

const statsView = (
  periods: ReadonlyArray<Period>,
  state: CycleState,
  h: HtmlBuilder<Message>,
): Html => {
  const lengths = cycleLengths(periods)
  const confidence = CycleStateSchema.match(state, {
    NoCycles: () => 'Rough',
    Expected: ({ confidence }) => confidence,
    Late: ({ confidence }) => confidence,
    Overdue: ({ confidence }) => confidence,
  })

  return h.div(
    [h.Class('flex flex-col gap-1 px-1')],
    [
      h.p(
        [h.Class('text-xs text-stone-500')],
        [
          Array.isReadonlyArrayEmpty(lengths)
            ? 'No complete cycles yet'
            : `${plural(lengths.length, 'cycle', 'cycles')} · median ${median(lengths)} days · ${confidence.toLowerCase()} estimate`,
        ],
      ),
      lastPeriodView(periods, h),
    ],
  )
}

export const view = (model: Model, h: HtmlBuilder<Message>): Document => {
  const periods = periodsFrom(model.logs)
  const state = stateFor(periods, model.today)

  const body = h.div(
    [h.Class('min-h-screen bg-[#f7f5f2] text-stone-900')],
    [
      h.div(
        [h.Class('mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-8')],
        [
          h.h1(
            [
              h.Class(
                'px-1 text-xs font-medium uppercase tracking-[0.2em] text-stone-400',
              ),
            ],
            ['cycle'],
          ),
          statusCardView(model, periods, state, h),
          dayStripView(model, h),
          flowEditorView(model, h),
          overdueCardView(model, state, h),
          statsView(periods, state, h),
        ],
      ),
    ],
  )

  return { title: 'cycle', body }
}

// FLAG

export const flags: Effect.Effect<Flags> = Effect.gen(function* () {
  const store = yield* KeyValueStore.KeyValueStore
  const millis = yield* Clock.currentTimeMillis
  const logsJson = yield* Effect.fromOption(
    Option.fromNullishOr(yield* store.get(LOGS_STORAGE_KEY)),
  )
  const logs = yield* Schema.decodeEffect(DayLogsJsonString)(logsJson)

  return { logs: Option.some(logs), today: dateKeyFromMillis(millis) }
}).pipe(
  Effect.catch(() =>
    Effect.map(Clock.currentTimeMillis, millis => ({
      logs: Option.none(),
      today: dateKeyFromMillis(millis),
    })),
  ),
  Effect.provide(BrowserKeyValueStore.layerLocalStorage),
)
