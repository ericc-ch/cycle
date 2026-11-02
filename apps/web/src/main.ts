import { Array, Clock, Effect, Match, Option, Order, Schema } from 'effect'
import { KeyValueStore } from 'effect/persistence'
import { Command, Runtime, type Update } from 'foldkit'
import type { Document, Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'

import {
  CycleStateSchema,
  type DateKey,
  type DayLog,
  DayLogSchema,
  type Flow,
  FlowSchema,
  type Period,
  cycleDayFor,
  cycleLengths,
  dateKeyFromMillis,
  dateKeyOrder,
  dayOfMonthLabel,
  flowOn,
  formatDayNumber,
  isBleedingFlow,
  latestPeriod,
  logsSorted,
  median,
  monthDayLabel,
  parseDayNumber,
  periodsFrom,
  stateFor,
  weekdayLabel,
} from '@cycle/domain'
import {
  Button,
  Dialog,
  Menu,
  Popover,
  Switch,
  Tabs,
  ToggleGroup,
  Tooltip,
} from '@cycle/ui'
import { font, palette, space, typeScale } from '@cycle/ui/src/tokens.stylex.js'
import { BrowserKeyValueStore } from '@effect/platform-browser'
import * as stylex from '@stylexjs/stylex'

const LOGS_STORAGE_KEY = 'cycle.logs'
const DAYS_SHOWN = 14
const TABS_ID = 'cycle-tabs'

type Tab = 'Today' | 'History' | 'About'
type FlowChoice = 'None' | Flow

const flowChoices: ReadonlyArray<ToggleGroup.ToggleOption<FlowChoice>> = [
  { value: 'None', label: 'None' },
  { value: 'Spotting', label: 'Spotting' },
  { value: 'Light', label: 'Light' },
  { value: 'Medium', label: 'Medium' },
  { value: 'Heavy', label: 'Heavy' },
]

// MODEL

const DayLogs = Schema.Array(DayLogSchema)

const DayLogsJsonString = Schema.fromJsonString(Schema.toCodecJson(DayLogs))

export const Model = Schema.Struct({
  logs: DayLogs,
  today: Schema.String,
  selectedDate: Schema.String,
  acknowledgedLateOn: Schema.Option(Schema.String),
  tab: Schema.Literals(['Today', 'History', 'About']),
  isPredicting: Schema.Boolean,
  isTooltipOpen: Schema.Boolean,
  isLegendOpen: Schema.Boolean,
  isMenuOpen: Schema.Boolean,
  menuIndex: Schema.Number,
  isAboutOpen: Schema.Boolean,
  isClearOpen: Schema.Boolean,
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

  SelectedTab: { tab: Schema.Literals(['Today', 'History', 'About']) },
  ToggledPrediction: {},

  ShowedTooltip: {},
  HidTooltip: {},

  OpenedLegend: {},
  ClosedLegend: {},

  OpenedMenu: {},
  ClosedMenu: {},
  MovedMenuIndex: { index: Schema.Number },

  OpenedAbout: {},
  ClosedAbout: {},

  OpenedClearConfirm: {},
  ClosedClearConfirm: {},
  ClearedAllLogs: {},
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
    tab: 'Today',
    isPredicting: true,
    isTooltipOpen: false,
    isLegendOpen: false,
    isMenuOpen: false,
    menuIndex: -1,
    isAboutOpen: false,
    isClearOpen: false,
  },
})

// UPDATE

type UpdateReturn = Update.Return<Model, Message>

const upsertLog = (
  logs: ReadonlyArray<DayLog>,
  date: DateKey,
  flow: Flow,
): ReadonlyArray<DayLog> => {
  const withoutDate = Array.filter(logs, log => log.date !== date)
  const updated = Array.append(withoutDate, { date, flow })

  return Array.sort(
    updated,
    Order.mapInput(dateKeyOrder, (log: DayLog) => log.date),
  )
}

export const update = (model: Model, message: Message) =>
  Message.match<UpdateReturn>(message, {
    SelectedDay: ({ date }) => ({
      model: modifyFields(model, {
        selectedDate: () => date,
        isTooltipOpen: () => false,
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

    SelectedTab: ({ tab }) => ({
      model: modifyFields(model, {
        tab: () => tab,
        isTooltipOpen: () => false,
        isLegendOpen: () => false,
        isMenuOpen: () => false,
      }),
    }),

    ToggledPrediction: () => ({
      model: modifyFields(model, {
        isPredicting: isPredicting => !isPredicting,
      }),
    }),

    ShowedTooltip: () => ({
      model: modifyFields(model, { isTooltipOpen: () => true }),
    }),

    HidTooltip: () => ({
      model: modifyFields(model, { isTooltipOpen: () => false }),
    }),

    OpenedLegend: () => ({
      model: modifyFields(model, { isLegendOpen: () => true }),
    }),

    ClosedLegend: () => ({
      model: modifyFields(model, { isLegendOpen: () => false }),
    }),

    OpenedMenu: () => ({
      model: modifyFields(model, {
        isMenuOpen: () => true,
        menuIndex: () => 0,
      }),
    }),

    ClosedMenu: () => ({
      model: modifyFields(model, {
        isMenuOpen: () => false,
        menuIndex: () => -1,
      }),
    }),

    MovedMenuIndex: ({ index }) => ({
      model: modifyFields(model, { menuIndex: () => index }),
    }),

    OpenedAbout: () => ({
      model: modifyFields(model, {
        isAboutOpen: () => true,
        isMenuOpen: () => false,
      }),
    }),

    ClosedAbout: () => ({
      model: modifyFields(model, { isAboutOpen: () => false }),
    }),

    OpenedClearConfirm: () => ({
      model: modifyFields(model, {
        isClearOpen: () => true,
        isMenuOpen: () => false,
      }),
    }),

    ClosedClearConfirm: () => ({
      model: modifyFields(model, { isClearOpen: () => false }),
    }),

    ClearedAllLogs: () => ({
      model: modifyFields(model, {
        logs: () => [],
        isClearOpen: () => false,
        isPredicting: () => true,
      }),
      commands: [SaveLogs({ logs: [] })],
    }),
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

const styles = stylex.create({
  page: {
    minHeight: '100dvh',
    display: 'flex',
    justifyContent: 'center',
    paddingBlock: space.huge,
    paddingInline: space.xl,
  },
  column: {
    width: '100%',
    maxWidth: '50ch',
    display: 'flex',
    flexDirection: 'column',
    gap: space.xxl,
  },
  masthead: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: space.lg,
  },
  wordmark: {
    fontSize: typeScale.lg,
    fontWeight: 600,
    letterSpacing: '-0.011em',
  },
  status: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.xs,
  },
  day: {
    fontFamily: font.mono,
    fontSize: typeScale.xxxl,
    fontWeight: 400,
    letterSpacing: '-0.02em',
    lineHeight: 1.1,
  },
  detail: {
    color: palette.fg1,
  },
  quiet: {
    color: palette.fg1,
    fontSize: typeScale.sm,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: space.xs,
  },
  cell: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    minHeight: '48px',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'transparent',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    padding: 0,
    ':focus-visible': {
      outlineWidth: '2px',
      outlineStyle: 'solid',
      outlineColor: palette.fg0,
      outlineOffset: '2px',
    },
  },
  cellSelected: {
    borderColor: palette.fg0,
  },
  cellNumber: {
    fontFamily: font.mono,
    fontSize: typeScale.sm,
    color: palette.fg1,
    lineHeight: 1,
  },
  cellNumberToday: {
    color: palette.fg0,
  },
  mark: {
    width: '16px',
    height: '2px',
    backgroundColor: 'transparent',
  },
  markSpotting: { height: '1px', backgroundColor: palette.fg2 },
  markLight: { backgroundColor: palette.fg2 },
  markMedium: { backgroundColor: palette.fg1 },
  markHeavy: { backgroundColor: palette.fg0 },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.md,
  },
  sectionHead: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: space.md,
    color: palette.fg1,
    fontSize: typeScale.sm,
  },
  mono: {
    fontFamily: font.mono,
    fontSize: typeScale.sm,
    color: palette.fg1,
  },
  rows: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.sm,
    margin: 0,
    padding: 0,
    listStyle: 'none',
  },
  row: {
    display: 'grid',
    gridTemplateColumns: '1fr auto',
    gap: space.lg,
    alignItems: 'baseline',
  },
  rowMeta: {
    fontFamily: font.mono,
    fontSize: typeScale.sm,
    color: palette.fg1,
    textAlign: 'end',
  },
  prose: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.md,
    color: palette.fg1,
  },
  strong: {
    color: palette.fg0,
  },
  legend: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.sm,
  },
  legendRow: {
    display: 'grid',
    gridTemplateColumns: '16px 1fr',
    gap: space.md,
    alignItems: 'center',
  },
  alert: {
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: palette.line,
    padding: space.md,
    display: 'flex',
    flexDirection: 'column',
    gap: space.sm,
  },
})

const plural = (count: number, singular: string, pluralForm: string): string =>
  count === 1 ? `1 ${singular}` : `${count} ${pluralForm}`

const windowLabel = (lowKey: string, highKey: string): string =>
  Option.match(Option.all([parseDayNumber(lowKey), parseDayNumber(highKey)]), {
    onNone: () => 'in a few days',
    onSome: ([low, high]) =>
      lowKey.slice(0, 7) === highKey.slice(0, 7)
        ? `${weekdayLabel(low)} ${dayOfMonthLabel(low)} – ${weekdayLabel(high)} ${dayOfMonthLabel(high)}`
        : `${monthDayLabel(low)} – ${monthDayLabel(high)}`,
  })

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

const markStyle = (maybeFlow: Option.Option<Flow>) =>
  Option.match(maybeFlow, {
    onNone: () => false,
    onSome: flow =>
      Match.value(flow).pipe(
        Match.when('Spotting', () => styles.markSpotting),
        Match.when('Light', () => styles.markLight),
        Match.when('Medium', () => styles.markMedium),
        Match.when('Heavy', () => styles.markHeavy),
        Match.exhaustive,
      ),
  })

const confidenceHint = (confidence: string): string =>
  Match.value(confidence).pipe(
    Match.when(
      'Rough',
      () => 'Fewer than three logged cycles, so the range is wide on purpose.',
    ),
    Match.when(
      'Fair',
      () =>
        'Three to five logged cycles. The range will narrow as more come in.',
    ),
    Match.when(
      'Good',
      () =>
        'Six or more logged cycles. This is about as precise as dates alone get.',
    ),
    Match.orElse(() => 'A range, not a promise.'),
  )

const tabs: ReadonlyArray<Tabs.TabItem<Tab>> = [
  { value: 'Today', label: 'Today' },
  { value: 'History', label: 'History' },
  { value: 'About', label: 'About' },
]

const mastheadView = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Attribute('class', stylex.attrs(styles.masthead).class ?? '')],
    [
      h.h1(
        [h.Attribute('class', stylex.attrs(styles.wordmark).class ?? '')],
        ['cycle'],
      ),
      model.tab === 'Today'
        ? Menu.view(
            {
              id: 'data-menu',
              label: 'Data',
              isOpen: model.isMenuOpen,
              activeIndex: model.menuIndex,
              items: [
                {
                  id: 'about',
                  label: 'How this works',
                  onSelect: Message.OpenedAbout(),
                },
                {
                  id: 'clear',
                  label: 'Clear all data',
                  onSelect: Message.OpenedClearConfirm(),
                },
              ],
              onToggle: model.isMenuOpen
                ? Message.ClosedMenu()
                : Message.OpenedMenu(),
              onClose: Message.ClosedMenu(),
              onActiveIndex: index => Message.MovedMenuIndex({ index }),
            },
            h,
          )
        : h.empty,
    ],
  )

const tabsView = (model: Model, h: HtmlBuilder<Message>): Html =>
  Tabs.view(
    {
      idPrefix: TABS_ID,
      label: 'Sections',
      value: model.tab,
      tabs,
      onChange: tab => Message.SelectedTab({ tab }),
    },
    h,
  )

const statusView = (
  model: Model,
  periods: ReadonlyArray<Period>,
  h: HtmlBuilder<Message>,
): Html => {
  const state = stateFor(periods, model.today)
  const maybeCycleDay = cycleDayFor(periods, model.today)
  const maybeTodayFlow = flowOn(model.logs, model.today)
  const day = Option.match(maybeCycleDay, {
    onNone: () => 'Day 1',
    onSome: value => `Day ${value}`,
  })

  if (Array.isReadonlyArrayEmpty(periods)) {
    return h.div(
      [
        h.Role('status'),
        h.Attribute('class', stylex.attrs(styles.status).class ?? ''),
      ],
      [
        h.p(
          [h.Attribute('class', stylex.attrs(styles.day).class ?? '')],
          ['Nothing logged'],
        ),
        h.p(
          [h.Attribute('class', stylex.attrs(styles.detail).class ?? '')],
          ['Tap a day below to log your period.'],
        ),
      ],
    )
  }

  if (Option.exists(maybeTodayFlow, isBleedingFlow)) {
    return h.div(
      [
        h.Role('status'),
        h.Attribute('class', stylex.attrs(styles.status).class ?? ''),
      ],
      [
        h.p(
          [h.Attribute('class', stylex.attrs(styles.day).class ?? '')],
          [day],
        ),
        h.p(
          [h.Attribute('class', stylex.attrs(styles.detail).class ?? '')],
          [
            Option.match(maybeTodayFlow, {
              onNone: () => 'Bleeding',
              onSome: flow => `Bleeding · ${flowLabel(flow)}`,
            }),
          ],
        ),
      ],
    )
  }

  if (!model.isPredicting) {
    return h.div(
      [
        h.Role('status'),
        h.Attribute('class', stylex.attrs(styles.status).class ?? ''),
      ],
      [
        h.p(
          [h.Attribute('class', stylex.attrs(styles.day).class ?? '')],
          [day],
        ),
        h.p(
          [h.Attribute('class', stylex.attrs(styles.detail).class ?? '')],
          ['Prediction is off.'],
        ),
      ],
    )
  }

  const predicted = CycleStateSchema.match(state, {
    NoCycles: () => ({
      text: 'Log one more period and I can start guessing.',
      confidence: 'Rough',
    }),
    Expected: ({ window, daysUntil, confidence }) => ({
      text:
        daysUntil <= 0
          ? `Period expected ${windowLabel(window.low, window.high)}`
          : `Period expected ${windowLabel(window.low, window.high)} · ${plural(daysUntil, 'day', 'days')}`,
      confidence,
    }),
    Late: ({ window, daysLate, confidence }) => ({
      text: `Expected by ${dateLabel(window.high)} · ${plural(daysLate, 'day', 'days')} later than usual`,
      confidence,
    }),
    Overdue: ({ daysLate, confidence }) => ({
      text: `${plural(daysLate, 'day', 'days')} later than usual`,
      confidence,
    }),
  })

  return h.div(
    [
      h.Role('status'),
      h.Attribute('class', stylex.attrs(styles.status).class ?? ''),
    ],
    [
      h.p([h.Attribute('class', stylex.attrs(styles.day).class ?? '')], [day]),
      h.div(
        [h.Attribute('class', stylex.attrs(styles.detail).class ?? '')],
        [
          h.span([], [`${predicted.text} · `]),
          Tooltip.view(
            {
              id: 'confidence-tooltip',
              label: `${predicted.confidence.toLowerCase()} estimate`,
              content: confidenceHint(predicted.confidence),
              isVisible: model.isTooltipOpen,
              onShow: Message.ShowedTooltip(),
              onHide: Message.HidTooltip(),
            },
            h,
          ),
        ],
      ),
    ],
  )
}

const overdueView = (
  model: Model,
  periods: ReadonlyArray<Period>,
  h: HtmlBuilder<Message>,
): Html => {
  const state = stateFor(periods, model.today)
  const isAcknowledged = Option.contains(model.acknowledgedLateOn, model.today)

  return CycleStateSchema.match(state, {
    Overdue: ({ daysLate }) =>
      isAcknowledged
        ? h.p(
            [h.Attribute('class', stylex.attrs(styles.quiet).class ?? '')],
            [
              'Counting days without alarm. Tap a day if you find the missing period later.',
            ],
          )
        : h.div(
            [h.Attribute('class', stylex.attrs(styles.alert).class ?? '')],
            [
              h.p(
                [],
                [
                  `${plural(daysLate, 'day', 'days')} later than usual. That happens. Two likely reasons: a period you did not log, or a late one.`,
                ],
              ),
              Button.view(
                {
                  label: 'It is just late',
                  onClick: Message.AcknowledgedLate({ date: model.today }),
                  variant: 'quiet',
                },
                h,
              ),
            ],
          ),
    NoCycles: () => h.empty,
    Expected: () => h.empty,
    Late: () => h.empty,
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
  const classes = stylex.attrs(
    styles.cell,
    isSelected && styles.cellSelected,
  ).class

  return h.keyed('button')(
    date,
    [
      h.Type('button'),
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
      h.Attribute('class', classes ?? ''),
    ],
    [
      h.span(
        [
          h.Attribute(
            'class',
            [
              stylex.attrs(styles.cellNumber).class,
              isToday ? stylex.attrs(styles.cellNumberToday).class : '',
            ]
              .filter(Boolean)
              .join(' '),
          ),
        ],
        [dayOfMonthLabel(dayNumber)],
      ),
      h.span([
        h.Attribute(
          'class',
          [
            stylex.attrs(styles.mark).class,
            stylex.attrs(markStyle(maybeFlow)).class,
          ]
            .filter(Boolean)
            .join(' '),
        ),
      ]),
    ],
  )
}

const dayGridView = (model: Model, h: HtmlBuilder<Message>): Html =>
  Option.match(parseDayNumber(model.today), {
    onNone: () => h.empty,
    onSome: todayNumber =>
      h.div(
        [h.Attribute('class', stylex.attrs(styles.grid).class ?? '')],
        Array.map(
          Array.makeBy(
            DAYS_SHOWN,
            index => todayNumber - (DAYS_SHOWN - 1) + index,
          ),
          dayNumber => dayCellView(model, dayNumber, h),
        ),
      ),
  })

const flowEditorView = (model: Model, h: HtmlBuilder<Message>): Html => {
  const maybeSelected = parseDayNumber(model.selectedDate)
  const currentFlow = flowOn(model.logs, model.selectedDate)

  return Option.match(maybeSelected, {
    onNone: () => h.empty,
    onSome: selectedNumber =>
      h.div(
        [h.Attribute('class', stylex.attrs(styles.section).class ?? '')],
        [
          h.div(
            [
              h.Attribute(
                'class',
                stylex.attrs(styles.sectionHead).class ?? '',
              ),
            ],
            [
              h.span(
                [],
                [
                  `${weekdayLabel(selectedNumber)} ${monthDayLabel(selectedNumber)}`,
                ],
              ),
              h.span(
                [h.Attribute('class', stylex.attrs(styles.mono).class ?? '')],
                [
                  Option.match(currentFlow, {
                    onNone: () => 'nothing logged',
                    onSome: flowLabel,
                  }),
                ],
              ),
            ],
          ),
          ToggleGroup.view<FlowChoice, Message>(
            {
              label: 'Flow',
              value: Option.getOrElse(
                Option.map(currentFlow, (flow): FlowChoice => flow),
                () => 'None' as const,
              ),
              options: flowChoices,
              onChange: choice =>
                choice === 'None'
                  ? Message.ClearedDay({ date: model.selectedDate })
                  : Message.LoggedFlow({
                      date: model.selectedDate,
                      flow: choice,
                    }),
            },
            h,
          ),
        ],
      ),
  })
}

const legendView = (h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Attribute('class', stylex.attrs(styles.legend).class ?? '')],
    [
      ...Array.map(
        [
          { label: 'heavy', style: styles.markHeavy },
          { label: 'medium', style: styles.markMedium },
          { label: 'light', style: styles.markLight },
          { label: 'spotting', style: styles.markSpotting },
        ] as const,
        entry =>
          h.div(
            [h.Attribute('class', stylex.attrs(styles.legendRow).class ?? '')],
            [
              h.span([
                h.Attribute(
                  'class',
                  [
                    stylex.attrs(styles.mark).class,
                    stylex.attrs(entry.style).class,
                  ]
                    .filter(Boolean)
                    .join(' '),
                ),
              ]),
              h.span([], [entry.label]),
            ],
          ),
      ),
      h.p(
        [h.Attribute('class', stylex.attrs(styles.quiet).class ?? '')],
        ['Ink, not colour: darker means a heavier day.'],
      ),
    ],
  )

const legendViewWithPopover = (model: Model, h: HtmlBuilder<Message>): Html =>
  Popover.view(
    {
      id: 'legend',
      label: 'what the marks mean',
      isOpen: model.isLegendOpen,
      onToggle: model.isLegendOpen
        ? Message.ClosedLegend()
        : Message.OpenedLegend(),
      onClose: Message.ClosedLegend(),
      children: [legendView(h)],
    },
    h,
  )

const todayView = (
  model: Model,
  periods: ReadonlyArray<Period>,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [h.Attribute('class', stylex.attrs(styles.section).class ?? '')],
    [
      statusView(model, periods, h),
      dayGridView(model, h),
      flowEditorView(model, h),
      overdueView(model, periods, h),
      legendViewWithPopover(model, h),
    ],
  )

const historyRows = (
  periods: ReadonlyArray<Period>,
  lengths: ReadonlyArray<number>,
): ReadonlyArray<{
  readonly id: string
  readonly label: string
  readonly meta: string
}> =>
  Array.getSomes(
    Array.map(periods, (period, index) =>
      Option.map(
        Option.all([parseDayNumber(period.start), parseDayNumber(period.end)]),
        ([start, end]) => {
          const days = end - start + 1

          return {
            id: period.start,
            label: `${monthDayLabel(start)} – ${monthDayLabel(end)}`,
            meta:
              `${plural(days, 'day', 'days')} · ` +
              Option.match(Array.get(lengths, index), {
                onNone: () => '—',
                onSome: length => `${length} day cycle`,
              }),
          }
        },
      ),
    ),
  )

const historyView = (
  periods: ReadonlyArray<Period>,
  h: HtmlBuilder<Message>,
): Html => {
  const lengths = cycleLengths(periods)
  const rows = Array.reverse(historyRows(periods, lengths))
  const lastPeriod = latestPeriod(periods)

  return h.div(
    [h.Attribute('class', stylex.attrs(styles.section).class ?? '')],
    [
      h.div(
        [h.Attribute('class', stylex.attrs(styles.sectionHead).class ?? '')],
        [
          h.span([], ['Periods']),
          h.span(
            [h.Attribute('class', stylex.attrs(styles.mono).class ?? '')],
            [
              Array.isReadonlyArrayEmpty(lengths)
                ? 'no complete cycles'
                : `${plural(lengths.length, 'cycle', 'cycles')} · median ${median(lengths)} days`,
            ],
          ),
        ],
      ),
      Array.isReadonlyArrayEmpty(rows)
        ? h.p(
            [h.Attribute('class', stylex.attrs(styles.quiet).class ?? '')],
            ['Nothing logged yet.'],
          )
        : h.ul(
            [h.Attribute('class', stylex.attrs(styles.rows).class ?? '')],
            Array.map(rows, row =>
              h.keyed('li')(
                row.id,
                [h.Attribute('class', stylex.attrs(styles.row).class ?? '')],
                [
                  h.span([], [row.label]),
                  h.span(
                    [
                      h.Attribute(
                        'class',
                        stylex.attrs(styles.rowMeta).class ?? '',
                      ),
                    ],
                    [row.meta],
                  ),
                ],
              ),
            ),
          ),
      Option.match(lastPeriod, {
        onNone: () => h.empty,
        onSome: period =>
          h.p(
            [h.Attribute('class', stylex.attrs(styles.quiet).class ?? '')],
            [`Last period started ${dateLabel(period.start)}.`],
          ),
      }),
    ],
  )
}

const aboutView = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Attribute('class', stylex.attrs(styles.section).class ?? '')],
    [
      Switch.view(
        {
          label: 'Prediction',
          checked: model.isPredicting,
          onToggle: Message.ToggledPrediction(),
        },
        h,
      ),
      h.div(
        [h.Attribute('class', stylex.attrs(styles.prose).class ?? '')],
        [
          h.p(
            [],
            [
              'Everything stays on this device. No account, no network requests, no analytics.',
            ],
          ),
          h.p(
            [],
            [
              'The next period is a ',
              h.span(
                [h.Attribute('class', stylex.attrs(styles.strong).class ?? '')],
                ['range'],
              ),
              ' because a date alone is not that precise. It is the median of your last six cycles, widened by how much your own cycles vary.',
            ],
          ),
          h.p(
            [],
            [
              'This app does not estimate ovulation or fertility, and it is not contraception.',
            ],
          ),
        ],
      ),
      Button.view(
        {
          label: 'How the range is calculated',
          onClick: Message.OpenedAbout(),
          variant: 'quiet',
        },
        h,
      ),
      Menu.view(
        {
          id: 'about-menu',
          label: 'Data',
          isOpen: model.isMenuOpen,
          activeIndex: model.menuIndex,
          items: [
            {
              id: 'about',
              label: 'How this works',
              onSelect: Message.OpenedAbout(),
            },
            {
              id: 'clear',
              label: 'Clear all data',
              onSelect: Message.OpenedClearConfirm(),
            },
          ],
          onToggle: model.isMenuOpen
            ? Message.ClosedMenu()
            : Message.OpenedMenu(),
          onClose: Message.ClosedMenu(),
          onActiveIndex: index => Message.MovedMenuIndex({ index }),
        },
        h,
      ),
    ],
  )

const aboutDialogView = (model: Model, h: HtmlBuilder<Message>): Html =>
  model.isAboutOpen
    ? Dialog.view(
        {
          id: 'about-dialog',
          title: 'How the range is calculated',
          children: [
            h.p(
              [],
              [
                'The centre is the median of your last six cycle lengths, not the average. One unusual cycle moves a median much less.',
              ],
            ),
            h.p(
              [],
              [
                'The width comes from your own spread, with a floor because a handful of cycles always looks more regular than it is. The window is roughly an 80% band, rounded outward to whole days.',
              ],
            ),
            h.p(
              [],
              [
                'While the cycle is running, the estimate is conditioned on it not having started yet, so it slides forward by less than a day for each late day instead of freezing.',
              ],
            ),
            h.p(
              [],
              [
                'Past the window it stops predicting and asks whether you missed a log.',
              ],
            ),
          ],
          onClose: Message.ClosedAbout(),
        },
        h,
      )
    : h.empty

const clearDialogView = (model: Model, h: HtmlBuilder<Message>): Html =>
  model.isClearOpen
    ? Dialog.view(
        {
          id: 'clear-dialog',
          title: 'Clear all data?',
          children: [
            h.p(
              [],
              [
                'This deletes every logged day from this device. It cannot be undone.',
              ],
            ),
            h.p(
              [h.Attribute('class', stylex.attrs(styles.quiet).class ?? '')],
              [`${plural(model.logs.length, 'day', 'days')} logged right now.`],
            ),
            Button.view(
              {
                label: 'Clear everything',
                onClick: Message.ClearedAllLogs(),
              },
              h,
            ),
          ],
          onClose: Message.ClosedClearConfirm(),
        },
        h,
      )
    : h.empty

export const view = (model: Model, h: HtmlBuilder<Message>): Document => {
  const periods = periodsFrom(model.logs)

  const content = Match.value(model.tab).pipe(
    Match.when('Today', () => todayView(model, periods, h)),
    Match.when('History', () => historyView(periods, h)),
    Match.when('About', () => aboutView(model, h)),
    Match.exhaustive,
  )

  const body = h.div(
    [h.Attribute('class', stylex.attrs(styles.page).class ?? '')],
    [
      h.main(
        [h.Attribute('class', stylex.attrs(styles.column).class ?? '')],
        [
          mastheadView(model, h),
          tabsView(model, h),
          Tabs.panel(
            {
              idPrefix: TABS_ID,
              value: model.tab,
              current: model.tab,
              children: [content],
            },
            h,
          ),
          aboutDialogView(model, h),
          clearDialogView(model, h),
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
