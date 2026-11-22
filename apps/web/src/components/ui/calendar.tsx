import type * as React from 'react'
import { useEffect, useRef, useState } from 'react'
import {
  Calendar as AriaCalendar,
  ButtonContext,
  CalendarCell,
  CalendarGrid,
  CalendarGridBody,
  CalendarGridHeader,
  CalendarHeaderCell,
  CalendarHeading,
} from 'react-aria-components'

import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
} from 'lucide-react'

import {
  type PlainDate,
  dayOfMonthLabel,
  formatPlainDate,
  fullDateLabel,
  monthNameLabel,
  monthWeeks,
  monthYearLabel,
  parsePlainDate,
  sameDay,
} from '../../domain'
import {
  type Gesture,
  type GestureEffect,
  type GestureEvent,
  rest,
  step,
} from '../../gesture'
import { haptics } from '../../haptics'
import { cn } from '../../lib/utils'
import { Button } from './button'

export type CalendarViewMode = 'month' | 'year'

const MONTHS: ReadonlyArray<number> = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
const MIN_YEAR = 2020

export type CalendarProps = {
  readonly selected: PlainDate
  readonly today: PlainDate
  readonly maxDate: PlainDate
  readonly onSelect: (date: PlainDate) => void
  readonly readOnly?: boolean
  readonly onLongPress?: ((date: PlainDate) => void) | undefined
  readonly onRangeSelect?:
    | ((start: PlainDate, end: PlainDate) => void)
    | undefined
  readonly onRangeEnd?: (() => void) | undefined
  readonly decoration?: (date: PlainDate) => React.ReactNode
  readonly isInRange?: (date: PlainDate) => boolean
  readonly viewMode?: CalendarViewMode
  readonly onViewModeChange?: ((mode: CalendarViewMode) => void) | undefined
  readonly previousLabel?: string
  readonly nextLabel?: string
}

/** React Aria owns the grid, the month paging, the weekday row, keyboard
 *  focus and the full-date label of every day. The press-and-drag paint, the
 *  marks and the haptics are ours: a range painted into a draft is not a
 *  selection any calendar library models. */
export const Calendar = ({
  selected,
  today,
  maxDate,
  onSelect,
  onRangeSelect,
  onRangeEnd,
  readOnly = false,
  onLongPress,
  decoration,
  isInRange,
  viewMode: controlledViewMode,
  onViewModeChange,
  previousLabel = 'Prev',
  nextLabel = 'Next',
}: CalendarProps) => {
  const [gesture, setGesture] = useState<Gesture>(rest)
  const [uncontrolledViewMode, setUncontrolledViewMode] =
    useState<CalendarViewMode>('month')
  const [yearValue, setYearValue] = useState<number>(selected.year)
  const viewMode = controlledViewMode ?? uncontrolledViewMode

  const setViewMode = (next: CalendarViewMode) => {
    if (next === 'year') {
      setYearValue(selected.year)
    }
    setUncontrolledViewMode(next)
    onViewModeChange?.(next)
  }

  const rangeSelect = useRef(onRangeSelect)
  const rangeEnd = useRef(onRangeEnd)
  const select = useRef(onSelect)
  const openEditing = useRef(onLongPress)
  const isReadOnly = useRef(readOnly)

  useEffect(() => {
    rangeSelect.current = onRangeSelect
    rangeEnd.current = onRangeEnd
    select.current = onSelect
    openEditing.current = onLongPress
    isReadOnly.current = readOnly
  }, [onRangeSelect, onRangeEnd, onSelect, onLongPress, readOnly])

  useEffect(() => {
    let current = rest
    let timer: number | null = null

    const run = (effects: ReadonlyArray<GestureEffect>) => {
      for (const effect of effects) {
        switch (effect.type) {
          case 'HoldTimer':
            timer = window.setTimeout(
              () => send({ type: 'Held' }),
              effect.delayMs,
            )
            break

          case 'DropHoldTimer':
            if (timer !== null) {
              window.clearTimeout(timer)
              timer = null
            }
            break

          case 'Haptic':
            if (effect.preset === 'hold') {
              haptics.hold()
            } else {
              haptics.step()
            }
            break

          case 'OpenEditing':
            openEditing.current?.(effect.date)
            break

          case 'ToggleDay':
            select.current(effect.date)
            break

          case 'PaintSpan':
            rangeSelect.current?.(effect.start, effect.end)
            break

          case 'EndRange':
            rangeEnd.current?.()
            break
        }
      }
    }

    const send = (event: GestureEvent) => {
      const next = step(current, event)

      current = next.gesture
      setGesture(next.gesture)
      run(next.effects)
    }

    const dayAt = (target: EventTarget | null): PlainDate | null => {
      const element = target instanceof Element ? target : null
      const day = element?.closest('[data-slot="calendar-day"]')

      if (!day || day.hasAttribute('data-disabled')) {
        return null
      }

      return parsePlainDate(day.getAttribute('data-date') ?? '')
    }

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) {
        return
      }

      const date = dayAt(event.target)

      if (date === null) {
        return
      }

      send({
        type: 'Pressed',
        date,
        kind: event.pointerType === 'touch' ? 'finger' : 'pointer',
        readOnly: isReadOnly.current,
        origin: { x: event.clientX, y: event.clientY },
      })
    }

    const onPointerMove = (event: PointerEvent) => {
      if (current.phase === 'rest') {
        return
      }

      // A finger's moves go to whatever the touch started on, so the day
      // under it has to be looked up. A mouse move already targets that day.
      const target =
        current.press.kind === 'finger'
          ? document.elementFromPoint(event.clientX, event.clientY)
          : event.target

      send({
        type: 'Moved',
        point: { x: event.clientX, y: event.clientY },
        date: dayAt(target),
      })
    }

    const onPointerUp = () => send({ type: 'Lifted' })

    const onPointerCancel = () => send({ type: 'Cancelled' })

    // iOS only lets a non-passive `touchmove` cancel a gesture if it was
    // already registered when the touch started, so this listener lives for
    // the whole mount and acts only while a held finger is dragging.
    const blockScroll = (event: TouchEvent) => {
      if (
        current.phase === 'pressed' &&
        current.press.kind === 'finger' &&
        current.press.held
      ) {
        event.preventDefault()
      }
    }

    // React Aria's press handles Enter and Space only while the calendar may
    // select, and this one is read-only so the app owns the selection.
    const onKeyDown = (event: KeyboardEvent) => {
      if (isReadOnly.current) {
        return
      }

      if (event.key !== 'Enter' && event.key !== ' ') {
        return
      }

      const date = dayAt(event.target)

      if (date === null) {
        return
      }

      event.preventDefault()
      select.current(date)
    }

    // Capture, because React Aria stops Enter and Space at the cell.
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('touchmove', blockScroll, { passive: false })
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerCancel)

    return () => {
      if (timer !== null) {
        window.clearTimeout(timer)
      }

      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('touchmove', blockScroll)
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerCancel)
    }
  }, [])

  if (viewMode === 'year') {
    return (
      <div
        data-slot="calendar"
        data-view="year"
        data-year={yearValue}
        className="flex flex-col gap-snug"
      >
        <div className="flex h-11 items-center justify-between gap-snug">
          <Button
            variant="outline"
            size="icon-sm"
            data-slot="calendar-previous-month"
            aria-label="Previous year"
            disabled={yearValue <= MIN_YEAR}
            onClick={() => setYearValue(current => Math.max(MIN_YEAR, current - 1))}
          >
            <ChevronLeftIcon aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            data-slot="calendar-view-toggle"
            onClick={() => setViewMode('month')}
            className="min-w-44 justify-center text-base font-semibold text-fg-0"
          >
            <span data-slot="calendar-heading">{yearValue}</span>
            <ChevronUpIcon
              aria-hidden="true"
              data-icon="inline-end"
              className="text-fg-1"
            />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            data-slot="calendar-next-month"
            aria-label="Next year"
            disabled={yearValue >= maxDate.year}
            onClick={() =>
              setYearValue(current => Math.min(maxDate.year, current + 1))
            }
          >
            <ChevronRightIcon aria-hidden="true" />
          </Button>
        </div>

        <div className="grid min-h-79 grid-cols-2 gap-base">
          {MONTHS.map(month => {
            const weeks = monthWeeks(yearValue, month)
            const firstInMonth = weeks[0]?.find(day => day.month === month)

            if (firstInMonth === undefined) {
              return null
            }

            const isCurrentMonth =
              yearValue === today.year && month === today.month

            return (
              <div
                key={month}
                data-year-month={`${yearValue}-${month}`}
                className="flex flex-col gap-tight"
              >
                <h3
                  className={cn(
                    'text-center text-sm font-medium text-fg-1',
                    isCurrentMonth && 'font-semibold text-accent',
                  )}
                >
                  {monthNameLabel(firstInMonth)}
                </h3>
                <table
                  role="grid"
                  aria-label={monthYearLabel(firstInMonth)}
                  data-slot="calendar-grid"
                  onContextMenu={event => event.preventDefault()}
                  className="w-full table-fixed select-none border-collapse [-webkit-touch-callout:none]"
                >
                  <tbody>
                    {weeks.map((week, weekIndex) => (
                      <tr key={weekIndex}>
                        {week.map(date => {
                          if (date.month !== month) {
                            return (
                              <td
                                key={formatPlainDate(date)}
                                className="h-6 p-0"
                              />
                            )
                          }

                          const isDisabled = date.compare(maxDate) > 0
                          const isCursor =
                            !readOnly && sameDay(date, selected)
                          const inRange = isInRange?.(date) ?? false
                          const isToday = sameDay(date, today)
                          const isHeld =
                            gesture.phase === 'pressed' &&
                            sameDay(gesture.press.start, date)

                          return (
                            <td
                              key={formatPlainDate(date)}
                              className="p-0"
                            >
                              <div
                                role="button"
                                tabIndex={isDisabled ? undefined : 0}
                                aria-label={fullDateLabel(date)}
                                aria-disabled={isDisabled || undefined}
                                data-slot="calendar-day"
                                data-date={formatPlainDate(date)}
                                data-today={isToday ? '' : undefined}
                                data-range={inRange ? '' : undefined}
                                data-disabled={
                                  isDisabled ? 'true' : undefined
                                }
                                className={cn(
                                  'flex min-h-6 w-full flex-col items-center justify-center gap-tight rounded-sm border border-transparent bg-transparent p-0 text-xs leading-none text-fg-1 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                                  readOnly
                                    ? 'cursor-default'
                                    : 'cursor-pointer',
                                  isToday &&
                                    'bg-accent-soft font-semibold text-accent',
                                  (isCursor || inRange || isHeld) &&
                                    'border-fg-0 bg-bg-1 font-semibold text-fg-0 shadow-control',
                                  isDisabled &&
                                    'cursor-default text-fg-2 opacity-60',
                                )}
                              >
                                <span aria-hidden="true">
                                  {dayOfMonthLabel(date)}
                                </span>
                                {decoration?.(date)}
                              </div>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <AriaCalendar
      aria-label="Calendar"
      data-slot="calendar"
      data-view="month"
      value={selected}
      isReadOnly
      maxValue={maxDate}
      firstDayOfWeek="mon"
      className="flex flex-col gap-snug"
    >
      <div className="flex h-11 items-center justify-between gap-snug">
        <Button
          slot="previous"
          variant="outline"
          size="icon-sm"
          data-slot="calendar-previous-month"
          aria-label={
            previousLabel === 'Prev' ? 'Previous month' : previousLabel
          }
        >
          <ChevronLeftIcon aria-hidden="true" />
        </Button>
        <ButtonContext.Provider value={{}}>
          <Button
            variant="ghost"
            size="sm"
            data-slot="calendar-view-toggle"
            onClick={() => setViewMode('year')}
            className="min-w-44 justify-center text-base font-semibold text-fg-0"
          >
            <CalendarHeading data-slot="calendar-heading" />
            <ChevronDownIcon
              aria-hidden="true"
              data-icon="inline-end"
              className="text-fg-1"
            />
          </Button>
        </ButtonContext.Provider>
        <Button
          slot="next"
          variant="outline"
          size="icon-sm"
          data-slot="calendar-next-month"
          aria-label={nextLabel === 'Next' ? 'Next month' : nextLabel}
        >
          <ChevronRightIcon aria-hidden="true" />
        </Button>
      </div>

      <div className="min-h-79">
        <CalendarGrid
          data-slot="calendar-grid"
          weekdayStyle="short"
          onContextMenu={event => event.preventDefault()}
          className="w-full table-fixed select-none border-separate border-spacing-tight [-webkit-touch-callout:none]"
        >
          <CalendarGridHeader>
            {day => (
              <CalendarHeaderCell className="pb-tight text-center text-sm font-normal text-fg-1">
                {day}
              </CalendarHeaderCell>
            )}
          </CalendarGridHeader>
          <CalendarGridBody>
            {date => {
              const isCursor = !readOnly && sameDay(date, selected)
              const inRange = isInRange?.(date) ?? false
              const isToday = sameDay(date, today)
              const isHeld =
                gesture.phase === 'pressed' &&
                sameDay(gesture.press.start, date)

              return (
                <CalendarCell
                  date={date}
                  data-slot="calendar-day"
                  data-date={formatPlainDate(date)}
                  data-today={isToday ? '' : undefined}
                  data-range={inRange ? '' : undefined}
                  className={({ isDisabled, isOutsideMonth }) =>
                    cn(
                      'flex min-h-11 w-full flex-col items-center justify-center gap-tight rounded-md border border-transparent bg-transparent p-0 text-sm transition-colors outline-none data-[focus-visible]:outline-2 data-[focus-visible]:outline-offset-2 data-[focus-visible]:outline-ring',
                      readOnly ? 'cursor-default' : 'cursor-pointer',
                      isOutsideMonth && !inRange ? 'text-fg-2' : 'text-fg-1',
                      isToday && 'bg-accent-soft font-semibold text-accent',
                      (isCursor || inRange || isHeld) &&
                        'border-fg-0 bg-bg-1 font-semibold text-fg-0 shadow-control',
                      isDisabled && 'cursor-default text-fg-2 opacity-60',
                    )
                  }
                >
                  <span aria-hidden="true">{dayOfMonthLabel(date)}</span>
                  {decoration?.(date)}
                </CalendarCell>
              )
            }}
          </CalendarGridBody>
        </CalendarGrid>
      </div>
    </AriaCalendar>
  )
}
