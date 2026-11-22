import { type Dispatch, useState } from 'react'

import {
  Button,
  Calendar,
  type CalendarViewMode,
  RadioGroup,
  RadioGroupItem,
} from '../components/ui'
import {
  CycleStateSchema,
  type DayLog,
  type Flow,
  type Period,
  cycleDayAt,
  datesBetween,
  dayNumber,
  flowAt,
  latestPeriodAt,
  monthDayLabel,
  sameDay,
  stateFor,
  weekdayLabel,
} from '../domain'
import { plural, windowLabel } from '../format'
import { haptics } from '../haptics'
import { cn } from '../lib/utils'
import type { Action, Draft, Model } from '../state'

const flowChoices: ReadonlyArray<Flow> = ['Bleeding', 'Spotting']

export const FlowMark = ({ flow }: { readonly flow: Flow | null }) => (
  <span
    aria-hidden="true"
    className={cn(
      'h-0.5 w-4 rounded-xs bg-transparent',
      flow === 'Spotting' && 'w-2 bg-spotting',
      flow === 'Bleeding' && 'bg-bleeding',
    )}
  />
)

const sameLogs = (
  a: ReadonlyArray<DayLog>,
  b: ReadonlyArray<DayLog>,
): boolean =>
  a.length === b.length &&
  a.every(
    (log, index) =>
      b[index] !== undefined &&
      sameDay(log.date, b[index].date) &&
      log.flow === b[index].flow,
  )

const TOP_CARD_CLASS =
  'flex min-h-32 flex-col gap-tight rounded-lg border border-line bg-bg-1 p-base shadow-surface'

/** One card, three lines: the headline, what it means, then the quiet context.
 *  The second and third lines share a size; only the third is muted. */
const CycleStatusCard = ({
  headline,
  headlineClass = 'text-fg-0',
  secondary,
  tertiary,
}: {
  readonly headline: string
  readonly headlineClass?: string | undefined
  readonly secondary: string
  readonly tertiary: string
}) => (
  <div role="status" data-slot="cycle-status" className={TOP_CARD_CLASS}>
    <p
      className={cn(
        'text-xl leading-snug font-semibold text-pretty',
        headlineClass,
      )}
    >
      {headline}
    </p>
    <p className="text-base text-fg-0 text-pretty">{secondary}</p>
    <p className="text-base text-fg-1 text-pretty">{tertiary}</p>
  </div>
)

const CycleStatus = ({
  model,
  periods,
}: {
  readonly model: Model
  readonly periods: ReadonlyArray<Period>
}) => {
  const cycleDay = cycleDayAt(periods, model.today)
  const lastPeriod = latestPeriodAt(periods)

  if (cycleDay === null || lastPeriod === null) {
    return (
      <CycleStatusCard
        headline="Nothing logged"
        secondary="No cycle to predict yet."
        tertiary="Hold a day to start logging."
      />
    )
  }

  const lastStartLabel = monthDayLabel(lastPeriod.start)
  const whereLine = `Cycle day ${cycleDay} · Last period ${lastStartLabel}`

  if (flowAt(model.logs, model.today) === 'Bleeding') {
    return (
      <CycleStatusCard
        headline={`Period day ${cycleDay}`}
        headlineClass="text-accent"
        secondary={`Started ${weekdayLabel(lastPeriod.start)} ${lastStartLabel}`}
        tertiary="Bleeding logged today"
      />
    )
  }

  if (!model.isPredicting) {
    return (
      <CycleStatusCard
        headline={`Cycle day ${cycleDay}`}
        secondary={`Last period started ${weekdayLabel(lastPeriod.start)} ${lastStartLabel}`}
        tertiary="Prediction is off."
      />
    )
  }

  const status = CycleStateSchema.match(stateFor(periods, model.today), {
    NoCycles: () => ({
      headline: `Cycle day ${cycleDay}`,
      secondary: `Last period started ${weekdayLabel(lastPeriod.start)} ${lastStartLabel}`,
      tertiary: 'Log one more period to see predictions.',
    }),
    Expected: ({ window, daysUntil }) => {
      const target = `${weekdayLabel(window.mostLikely)} ${monthDayLabel(window.mostLikely)}`

      return {
        headline:
          daysUntil <= 0
            ? 'Next period expected any day'
            : `Next period in ${plural(daysUntil, 'day', 'days')}`,
        secondary: `Around ${target} · ${windowLabel(window.low, window.high)}`,
        tertiary: whereLine,
      }
    },
    Late: ({ window, daysLate }) => ({
      headline: `${plural(daysLate, 'day', 'days')} later than usual`,
      secondary: `Expected by ${weekdayLabel(window.high)} ${monthDayLabel(window.high)}`,
      tertiary: whereLine,
    }),
    Overdue: ({ daysLate }) => ({
      headline: `${plural(daysLate, 'day', 'days')} later than usual`,
      secondary: 'Past the usual window',
      tertiary: whereLine,
    }),
  })

  return (
    <CycleStatusCard
      headline={status.headline}
      secondary={status.secondary}
      tertiary={status.tertiary}
    />
  )
}

const OverdueNotice = ({
  model,
  periods,
  dispatch,
}: {
  readonly model: Model
  readonly periods: ReadonlyArray<Period>
  readonly dispatch: Dispatch<Action>
}) => {
  if (!model.isPredicting) {
    return null
  }

  return CycleStateSchema.match(stateFor(periods, model.today), {
    NoCycles: () => null,
    Expected: () => null,
    Late: () => null,
    Overdue: () =>
      model.acknowledgedLateOn !== null &&
      sameDay(model.acknowledgedLateOn, model.today) ? (
        <p className="text-sm text-fg-1">
          Hold any day to log a missed period.
        </p>
      ) : (
        <div className="flex flex-col gap-snug rounded-lg border border-line bg-bg-1 p-base shadow-surface">
          <p>Missed a log, or running late?</p>
          <Button
            variant="ghost"
            onClick={() =>
              dispatch({ type: 'AcknowledgedLate', date: model.today })
            }
          >
            Mark as late
          </Button>
        </div>
      ),
  })
}

const EditCard = ({
  draft,
  savedLogs,
  dispatch,
}: {
  readonly draft: Draft
  readonly savedLogs: ReadonlyArray<DayLog>
  readonly dispatch: Dispatch<Action>
}) => {
  const changed = !sameLogs(draft.logs, savedLogs)

  return (
    <div
      data-slot="edit-banner"
      data-state={changed ? 'dirty' : 'clean'}
      data-draft-days={draft.logs.length}
      className={cn(TOP_CARD_CLASS, 'h-full justify-between gap-snug')}
    >
      <div className="flex items-center justify-between gap-snug">
        <span className="text-sm font-semibold text-fg-0">
          {changed ? 'Unsaved changes' : 'Editing'}
        </span>
        <div className="flex items-center gap-snug">
          <Button
            variant="primary"
            size="sm"
            className="min-h-9 px-base text-xs"
            disabled={!changed}
            onClick={() => {
              haptics.save()
              dispatch({ type: 'SavedEditing' })
            }}
          >
            Save
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="min-h-9 px-base text-xs"
            onClick={() => {
              haptics.cancel()
              dispatch({ type: 'CancelledEditing' })
            }}
          >
            Cancel
          </Button>
        </div>
      </div>

      <div data-slot="flow-editor">
        <RadioGroup
          aria-label="Flow"
          orientation="horizontal"
          value={draft.flow}
          onChange={value => {
            if (value === 'Bleeding' || value === 'Spotting') {
              dispatch({ type: 'SetDraftFlow', flow: value })
            }
          }}
        >
          {flowChoices.map(flow => (
            <RadioGroupItem
              key={flow}
              value={flow}
              className="min-h-9 text-xs"
            >
              <FlowMark flow={flow} />
              {flow}
            </RadioGroupItem>
          ))}
        </RadioGroup>
      </div>
    </div>
  )
}

export const TodayView = ({
  model,
  periods,
  dispatch,
}: {
  readonly model: Model
  readonly periods: ReadonlyArray<Period>
  readonly dispatch: Dispatch<Action>
}) => {
  const [viewMode, setViewMode] = useState<CalendarViewMode>('month')
  const draft = model.draft
  const logs = draft?.logs ?? model.logs
  const rangeStart = draft?.rangeStart ?? null
  const rangeEnd = draft?.rangeEnd ?? null
  const rangeDays =
    rangeStart === null
      ? new Set<number>()
      : new Set(datesBetween(rangeStart, rangeEnd ?? rangeStart).map(dayNumber))

  return (
    <div className="flex flex-col gap-base">
      <div className="grid">
        <div
          className={cn(
            'col-start-1 row-start-1',
            draft !== null && 'invisible',
          )}
          aria-hidden={draft !== null ? true : undefined}
        >
          <CycleStatus model={model} periods={periods} />
        </div>
        {draft === null ? null : (
          <div className="col-start-1 row-start-1">
            <EditCard
              draft={draft}
              savedLogs={model.logs}
              dispatch={dispatch}
            />
          </div>
        )}
      </div>

      <Calendar
        selected={draft?.selectedDate ?? model.today}
        today={model.today}
        maxDate={model.today}
        readOnly={draft === null}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onLongPress={
          draft === null
            ? date => {
                haptics.start()
                dispatch({ type: 'StartedEditing', date })
              }
            : undefined
        }
        onSelect={date => {
          haptics.step()
          dispatch({ type: 'PaintedDay', date })
        }}
        onRangeSelect={
          draft === null
            ? undefined
            : (start, end) => dispatch({ type: 'DraggedRange', start, end })
        }
        onRangeEnd={() => dispatch({ type: 'EndedRange' })}
        decoration={date => <FlowMark flow={flowAt(logs, date)} />}
        isInRange={date => rangeDays.has(dayNumber(date))}
      />

      <div className="flex flex-col gap-snug">
        {draft === null ? (
          <p className="flex min-h-11 items-center justify-center text-sm text-fg-1">
            Hold any day to edit
          </p>
        ) : null}

        <OverdueNotice model={model} periods={periods} dispatch={dispatch} />
      </div>
    </div>
  )
}
