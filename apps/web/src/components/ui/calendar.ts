import { Match } from 'effect'
import { Calendar as CoreCalendar } from 'foldkit'
import type { Html, HtmlBuilder } from 'foldkit/html'

import type {
  CalendarAttributes,
  DayCell,
  DaysModeAttributes,
} from '@foldkit/ui/calendar'
import * as stylex from '@stylexjs/stylex'

import { font, palette, space, typeScale } from '../../tokens.stylex.js'

export * from '@foldkit/ui/calendar'

/** Monday-first English. The site is British English, so weeks start on Monday. */
export const mondayFirstLocale = {
  ...CoreCalendar.defaultEnglishLocale,
  firstDayOfWeek: 'Monday' as const,
}

const styles = stylex.create({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.sm,
  },
  header: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: space.md,
  },
  heading: {
    fontFamily: font.sans,
    fontSize: typeScale.base,
    fontWeight: 600,
    letterSpacing: '-0.011em',
  },
  nav: {
    fontFamily: font.sans,
    fontSize: typeScale.sm,
    color: palette.fg1,
    backgroundColor: 'transparent',
    borderWidth: 0,
    padding: 0,
    cursor: 'pointer',
    textDecorationLine: 'underline',
    textDecorationThickness: '1px',
    textUnderlineOffset: '0.18em',
    textDecorationColor: 'color-mix(in oklab, currentcolor 40%, transparent)',
    ':hover': { color: palette.fg0, textDecorationColor: 'currentcolor' },
    ':focus-visible': {
      outlineWidth: '2px',
      outlineStyle: 'solid',
      outlineColor: palette.fg0,
      outlineOffset: '2px',
    },
  },
  grid: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.xs,
    ':focus-visible': {
      outlineWidth: '2px',
      outlineStyle: 'solid',
      outlineColor: palette.fg0,
      outlineOffset: '2px',
    },
  },
  headerRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: space.xs,
  },
  columnHeader: {
    fontFamily: font.sans,
    fontSize: typeScale.sm,
    color: palette.fg1,
    textAlign: 'center',
    paddingBottom: space.xs,
  },
  week: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: space.xs,
  },
  cell: {
    display: 'flex',
  },
  day: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    width: '100%',
    minHeight: '44px',
    padding: 0,
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'transparent',
    backgroundColor: 'transparent',
    fontFamily: font.sans,
    fontSize: typeScale.sm,
    color: palette.fg1,
    cursor: 'pointer',
    ':focus-visible': {
      outlineWidth: '2px',
      outlineStyle: 'solid',
      outlineColor: palette.fg0,
      outlineOffset: '2px',
    },
  },
  daySelected: {
    borderColor: palette.fg0,
    color: palette.fg0,
  },
  dayToday: {
    color: palette.fg0,
  },
  dayOutside: {
    color: palette.fg2,
  },
  dayDisabled: {
    color: palette.fg1,
    opacity: 0.7,
    cursor: 'default',
  },
})

export type RenderConfig<Message> = Readonly<{
  /** Rendered under the day number. Return `null` for no decoration; the
   *  app returns an empty mark so the numbers stay on one baseline. */
  decoration?: (cell: DayCell, h: HtmlBuilder<Message>) => Html | null
  previousLabel?: string
  nextLabel?: string
}>

const dayCell = <Message>(
  cell: DayCell,
  config: RenderConfig<Message>,
  h: HtmlBuilder<Message>,
): Html => {
  const decoration = config.decoration?.(cell, h) ?? null

  return h.div(
    [
      ...cell.cellAttributes,
      h.DataAttribute('slot', 'calendar-cell'),
      h.Attribute('class', stylex.attrs(styles.cell).class ?? ''),
    ],
    [
      h.button(
        [
          ...cell.buttonAttributes,
          h.DataAttribute('slot', 'calendar-day'),
          h.Attribute(
            'class',
            stylex.attrs(
              styles.day,
              cell.isSelected && styles.daySelected,
              cell.isToday && styles.dayToday,
              !cell.isInViewMonth && styles.dayOutside,
              cell.isDisabled && styles.dayDisabled,
            ).class ?? '',
          ),
        ],
        [
          h.span([], [cell.label]),
          ...(decoration === null ? [] : [decoration]),
        ],
      ),
    ],
  )
}

const daysView = <Message>(
  days: DaysModeAttributes,
  config: RenderConfig<Message>,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [
      ...days.root,
      h.DataAttribute('slot', 'calendar'),
      h.Attribute('class', stylex.attrs(styles.root).class ?? ''),
    ],
    [
      h.div(
        [h.Attribute('class', stylex.attrs(styles.header).class ?? '')],
        [
          h.button(
            [
              ...days.previousMonthButton,
              h.DataAttribute('slot', 'calendar-previous-month'),
              h.Attribute('class', stylex.attrs(styles.nav).class ?? ''),
            ],
            [config.previousLabel ?? 'Prev'],
          ),
          h.h2(
            [
              h.Id(days.heading.id),
              h.Attribute('class', stylex.attrs(styles.heading).class ?? ''),
            ],
            [days.heading.text],
          ),
          h.button(
            [
              ...days.nextMonthButton,
              h.DataAttribute('slot', 'calendar-next-month'),
              h.Attribute('class', stylex.attrs(styles.nav).class ?? ''),
            ],
            [config.nextLabel ?? 'Next'],
          ),
        ],
      ),
      h.div(
        [
          ...days.grid,
          h.DataAttribute('slot', 'calendar-grid'),
          h.Attribute('class', stylex.attrs(styles.grid).class ?? ''),
        ],
        [
          h.div(
            [
              ...days.headerRow,
              h.Attribute('class', stylex.attrs(styles.headerRow).class ?? ''),
            ],
            days.columnHeaders.map(column =>
              h.div(
                [
                  ...column.attributes,
                  h.Attribute(
                    'class',
                    stylex.attrs(styles.columnHeader).class ?? '',
                  ),
                ],
                [column.name],
              ),
            ),
          ),
          ...days.weeks.map(week =>
            h.div(
              [
                ...week.attributes,
                h.Attribute('class', stylex.attrs(styles.week).class ?? ''),
              ],
              week.cells.map(cell => dayCell(cell, config, h)),
            ),
          ),
        ],
      ),
    ],
  )

/** A month view. The heading is text, not a button, so the calendar stays in
 *  day mode; paging is month by month. */
export const render = <Message>(
  attributes: CalendarAttributes,
  config: RenderConfig<Message>,
  h: HtmlBuilder<Message>,
): Html =>
  Match.value(attributes).pipe(
    Match.tag('Days', days => daysView(days, config, h)),
    Match.orElse(() => h.div([])),
  )
