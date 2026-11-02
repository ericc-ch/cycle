import { Array, Clock, Effect, Match, Option, Order, Schema } from 'effect'
import { KeyValueStore } from 'effect/persistence'
import { Command, Runtime, Update } from 'foldkit'
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
import { BrowserKeyValueStore } from '@effect/platform-browser'
import * as stylex from '@stylexjs/stylex'

import {
  Button,
  Dialog,
  Menu,
  Popover,
  RadioGroup,
  Switch,
  Tabs,
  Tooltip,
} from './components/ui'
import { font, palette, space, typeScale } from './tokens.stylex.js'

const LOGS_STORAGE_KEY = 'cycle.logs'
const DAYS_SHOWN = 14
const TABS_ID = 'cycle-tabs'
const FLOW_ID = 'flow'
const TOOLTIP_ID = 'confidence'
const LEGEND_ID = 'legend'
const DATA_MENU_ID = 'data-menu'
const ABOUT_DIALOG_ID = 'about-dialog'
const CLEAR_DIALOG_ID = 'clear-dialog'
const PREDICTION_SWITCH_ID = 'prediction'

type Tab = 'Today' | 'History' | 'About'
type FlowChoice = 'None' | Flow
type DataItem = 'about' | 'clear'

const tabs: ReadonlyArray<Tab> = ['Today', 'History', 'About']
const flowChoices: ReadonlyArray<FlowChoice> = [
  'None',
  'Spotting',
  'Light',
  'Medium',
  'Heavy',
]
const dataItems: ReadonlyArray<DataItem> = ['about', 'clear']

const CycleTabs = Tabs.create<Tab>()
const FlowGroup = RadioGroup.create<FlowChoice>()
const DataMenu = Menu.create<DataItem>()

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
  tabs: Tabs.Model,
  flow: RadioGroup.Model,
  tooltip: Tooltip.Model,
  legend: Popover.Model,
  menu: Menu.Model,
  aboutDialog: Dialog.Model,
  clearDialog: Dialog.Model,
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
  SetPrediction: { isPredicting: Schema.Boolean },
  ClearedAllLogs: {},
  OpenedAbout: {},

  GotTabsMessage: { message: Tabs.Message },
  GotFlowMessage: { message: RadioGroup.Message },
  GotTooltipMessage: { message: Tooltip.Message },
  GotLegendMessage: { message: Popover.Message },
  GotMenuMessage: { message: Menu.Message },
  GotAboutDialogMessage: { message: Dialog.Message },
  GotClearDialogMessage: { message: Dialog.Message },
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
    tabs: Tabs.init({ id: TABS_ID }),
    flow: RadioGroup.init({ id: FLOW_ID }),
    tooltip: Tooltip.init({ id: TOOLTIP_ID }),
    legend: Popover.init({ id: LEGEND_ID }),
    menu: Menu.init({ id: DATA_MENU_ID }),
    aboutDialog: Dialog.init({ id: ABOUT_DIALOG_ID }),
    clearDialog: Dialog.init({ id: CLEAR_DIALOG_ID }),
  },
})

// UPDATE

type UpdateReturn = Update.Return<Model, Message>
type UpdateStep = Update.Step<Model, Message>

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

const logFlow = (model: Model, date: DateKey, flow: Flow): UpdateReturn => {
  const logs = upsertLog(model.logs, date, flow)

  return {
    model: modifyFields(model, {
      logs: () => logs,
      selectedDate: () => date,
    }),
    commands: [SaveLogs({ logs })],
  }
}

const clearDay = (model: Model, date: DateKey): UpdateReturn => {
  const logs = Array.filter(model.logs, log => log.date !== date)

  return {
    model: modifyFields(model, { logs: () => logs }),
    commands: [SaveLogs({ logs })],
  }
}

const clearAllLogs = (model: Model): UpdateReturn => ({
  model: modifyFields(model, {
    logs: () => [],
    isPredicting: () => true,
  }),
  commands: [SaveLogs({ logs: [] })],
})

const foldDialogOutMessage = Dialog.OutMessage.match<UpdateStep>({
  Opened: () => model => ({ model }),
  Closed: () => model => ({ model }),
})

const foldTabsOutMessage = Tabs.OutMessage.match<
  UpdateStep,
  Tabs.OutMessage<Tab>
>({
  Selected:
    ({ value }) =>
    model => ({
      model: modifyFields(model, { tab: () => value }),
    }),
})

const foldFlowOutMessage = RadioGroup.OutMessage.match<
  UpdateStep,
  RadioGroup.OutMessage<FlowChoice>
>({
  Selected:
    ({ value }) =>
    model =>
      value === 'None'
        ? clearDay(model, model.selectedDate)
        : logFlow(model, model.selectedDate, value),
})

const foldTooltipOutMessage = Tooltip.OutMessage.match<UpdateStep>({
  Shown: () => model => ({ model }),
  Hidden: () => model => ({ model }),
})

const foldLegendOutMessage = Popover.OutMessage.match<UpdateStep>({
  Opened: () => model => ({ model }),
  Closed: () => model => ({ model }),
})

const foldTabs = Update.foldChild({
  update: CycleTabs.update,
  read: (model: Model) => Option.some(model.tabs),
  write: (model, nextTabs) => modifyFields(model, { tabs: () => nextTabs }),
  toParentMessage: message => Message.GotTabsMessage({ message }),
  foldOutMessage: foldTabsOutMessage,
})

const foldFlow = Update.foldChild({
  update: FlowGroup.update,
  read: (model: Model) => Option.some(model.flow),
  write: (model, nextFlow) => modifyFields(model, { flow: () => nextFlow }),
  toParentMessage: message => Message.GotFlowMessage({ message }),
  foldOutMessage: foldFlowOutMessage,
})

const foldTooltip = Update.foldChild({
  update: Tooltip.update,
  read: (model: Model) => Option.some(model.tooltip),
  write: (model, nextTooltip) =>
    modifyFields(model, { tooltip: () => nextTooltip }),
  toParentMessage: message => Message.GotTooltipMessage({ message }),
  foldOutMessage: foldTooltipOutMessage,
})

const foldLegend = Update.foldChild({
  update: Popover.update,
  read: (model: Model) => Option.some(model.legend),
  write: (model, nextLegend) =>
    modifyFields(model, { legend: () => nextLegend }),
  toParentMessage: message => Message.GotLegendMessage({ message }),
  foldOutMessage: foldLegendOutMessage,
})

const foldAboutDialog = Update.foldChild({
  update: Dialog.update,
  read: (model: Model) => Option.some(model.aboutDialog),
  write: (model, nextAboutDialog) =>
    modifyFields(model, { aboutDialog: () => nextAboutDialog }),
  toParentMessage: message => Message.GotAboutDialogMessage({ message }),
  foldOutMessage: foldDialogOutMessage,
})

const foldClearDialog = Update.foldChild({
  update: Dialog.update,
  read: (model: Model) => Option.some(model.clearDialog),
  write: (model, nextClearDialog) =>
    modifyFields(model, { clearDialog: () => nextClearDialog }),
  toParentMessage: message => Message.GotClearDialogMessage({ message }),
  foldOutMessage: foldDialogOutMessage,
})

const foldAboutDialogOpen = Update.foldChildStep({
  update: Dialog.open,
  read: (model: Model) => Option.some(model.aboutDialog),
  write: (model, nextAboutDialog) =>
    modifyFields(model, { aboutDialog: () => nextAboutDialog }),
  toParentMessage: message => Message.GotAboutDialogMessage({ message }),
  foldOutMessage: foldDialogOutMessage,
})

const foldClearDialogOpen = Update.foldChildStep({
  update: Dialog.open,
  read: (model: Model) => Option.some(model.clearDialog),
  write: (model, nextClearDialog) =>
    modifyFields(model, { clearDialog: () => nextClearDialog }),
  toParentMessage: message => Message.GotClearDialogMessage({ message }),
  foldOutMessage: foldDialogOutMessage,
})

const foldClearDialogClose = Update.foldChildStep({
  update: Dialog.close,
  read: (model: Model) => Option.some(model.clearDialog),
  write: (model, nextClearDialog) =>
    modifyFields(model, { clearDialog: () => nextClearDialog }),
  toParentMessage: message => Message.GotClearDialogMessage({ message }),
  foldOutMessage: foldDialogOutMessage,
})

const foldMenuOutMessage = Menu.OutMessage.match<
  UpdateStep,
  Menu.OutMessage<DataItem>
>({
  Selected:
    ({ value }) =>
    model =>
      value === 'about'
        ? foldAboutDialogOpen(model)
        : foldClearDialogOpen(model),
})

const foldMenu = Update.foldChild({
  update: DataMenu.update,
  read: (model: Model) => Option.some(model.menu),
  write: (model, nextMenu) => modifyFields(model, { menu: () => nextMenu }),
  toParentMessage: message => Message.GotMenuMessage({ message }),
  foldOutMessage: foldMenuOutMessage,
})

export const update = (model: Model, message: Message) =>
  Message.match<UpdateReturn>(message, {
    SelectedDay: ({ date }) => ({
      model: modifyFields(model, { selectedDate: () => date }),
    }),

    LoggedFlow: ({ date, flow }) => logFlow(model, date, flow),

    ClearedDay: ({ date }) => clearDay(model, date),

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

    SetPrediction: ({ isPredicting }) => ({
      model: modifyFields(model, { isPredicting: () => isPredicting }),
    }),

    ClearedAllLogs: () =>
      Update.combine(model, [clearAllLogs, foldClearDialogClose]),

    OpenedAbout: () => foldAboutDialogOpen(model),

    GotTabsMessage: ({ message }) => foldTabs(model, message),
    GotFlowMessage: ({ message }) => foldFlow(model, message),
    GotTooltipMessage: ({ message }) => foldTooltip(model, message),
    GotLegendMessage: ({ message }) => foldLegend(model, message),
    GotMenuMessage: ({ message }) => foldMenu(model, message),
    GotAboutDialogMessage: ({ message }) => foldAboutDialog(model, message),
    GotClearDialogMessage: ({ message }) => foldClearDialog(model, message),
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

const dataMenuLabel = (item: DataItem): string =>
  item === 'about' ? 'How this works' : 'Clear all data'

const mastheadView = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Attribute('class', stylex.attrs(styles.masthead).class ?? '')],
    [
      h.h1(
        [h.Attribute('class', stylex.attrs(styles.wordmark).class ?? '')],
        ['cycle'],
      ),
      h.submodel({
        slotId: DATA_MENU_ID,
        model: model.menu,
        view: DataMenu.view,
        viewInputs: Menu.renderConfig<DataItem, Message>(
          {
            items: dataItems,
            label: dataMenuLabel,
            trigger: 'Data',
          },
          h,
        ),
        toParentMessage: message => Message.GotMenuMessage({ message }),
      }),
    ],
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
          h.submodel({
            slotId: TOOLTIP_ID,
            model: model.tooltip,
            view: Tooltip.view,
            viewInputs: {
              anchor: { placement: 'top', gap: 6, padding: 8 },
              toView: info =>
                Tooltip.render(
                  info,
                  {
                    label: `${predicted.confidence.toLowerCase()} estimate`,
                    content: confidenceHint(predicted.confidence),
                  },
                  h,
                ),
            },
            toParentMessage: message => Message.GotTooltipMessage({ message }),
          }),
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
              Button.render(
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
  const choice: FlowChoice = Option.match(currentFlow, {
    onNone: () => 'None',
    onSome: flow => flow,
  })

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
          h.submodel({
            slotId: FLOW_ID,
            model: model.flow,
            view: FlowGroup.view,
            viewInputs: {
              options: flowChoices,
              selectedValue: Option.some(choice),
              ariaLabel: 'Flow',
              orientation: 'Horizontal',
              toView: info => RadioGroup.render(info, value => value, h),
            },
            toParentMessage: message => Message.GotFlowMessage({ message }),
          }),
        ],
      ),
  })
}

const legendContent = (h: HtmlBuilder<Message>): Html =>
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

const legendView = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.submodel({
    slotId: LEGEND_ID,
    model: model.legend,
    view: Popover.view,
    viewInputs: {
      anchor: { placement: 'bottom-start', gap: 8, padding: 8 },
      toView: info =>
        Popover.render(
          info,
          { label: 'what the marks mean', children: legendContent(h) },
          h,
        ),
    },
    toParentMessage: message => Message.GotLegendMessage({ message }),
  })

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
      legendView(model, h),
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
      Switch.render(
        {
          id: PREDICTION_SWITCH_ID,
          label: 'Prediction',
          isChecked: model.isPredicting,
          onToggle: isPredicting => Message.SetPrediction({ isPredicting }),
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
      Button.render(
        {
          label: 'How the range is calculated',
          onClick: Message.OpenedAbout(),
          variant: 'quiet',
        },
        h,
      ),
    ],
  )

const tabContent = (
  tab: Tab,
  model: Model,
  periods: ReadonlyArray<Period>,
  h: HtmlBuilder<Message>,
): Html =>
  Match.value(tab).pipe(
    Match.when('Today', () => todayView(model, periods, h)),
    Match.when('History', () => historyView(periods, h)),
    Match.when('About', () => aboutView(model, h)),
    Match.exhaustive,
  )

const tabsView = (
  model: Model,
  periods: ReadonlyArray<Period>,
  h: HtmlBuilder<Message>,
): Html =>
  h.submodel({
    slotId: TABS_ID,
    model: model.tabs,
    view: CycleTabs.view,
    viewInputs: {
      tabs,
      selectedValue: model.tab,
      ariaLabel: 'Sections',
      toView: info =>
        Tabs.render(info, tab => tabContent(tab, model, periods, h), h),
    },
    toParentMessage: message => Message.GotTabsMessage({ message }),
  })

const aboutDialogView = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.submodel({
    slotId: ABOUT_DIALOG_ID,
    model: model.aboutDialog,
    view: Dialog.view,
    viewInputs: {
      toView: info =>
        Dialog.render(
          info,
          {
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
          },
          h,
        ),
    },
    toParentMessage: message => Message.GotAboutDialogMessage({ message }),
  })

const clearDialogView = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.submodel({
    slotId: CLEAR_DIALOG_ID,
    model: model.clearDialog,
    view: Dialog.view,
    viewInputs: {
      toView: info =>
        Dialog.render(
          info,
          {
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
                [
                  `${plural(model.logs.length, 'day', 'days')} logged right now.`,
                ],
              ),
              Button.render(
                {
                  label: 'Clear everything',
                  onClick: Message.ClearedAllLogs(),
                },
                h,
              ),
            ],
          },
          h,
        ),
    },
    toParentMessage: message => Message.GotClearDialogMessage({ message }),
  })

export const view = (model: Model, h: HtmlBuilder<Message>): Document => {
  const periods = periodsFrom(model.logs)

  const body = h.div(
    [h.Attribute('class', stylex.attrs(styles.page).class ?? '')],
    [
      h.main(
        [h.Attribute('class', stylex.attrs(styles.column).class ?? '')],
        [
          mastheadView(model, h),
          tabsView(model, periods, h),
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
