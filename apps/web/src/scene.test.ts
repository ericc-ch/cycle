import { Option } from 'effect'
import {
  Command,
  click,
  expect,
  given,
  hover,
  keydown,
  role,
  scene,
  text,
} from 'foldkit/scene'
import { describe, test } from 'vitest'

import { Message, type Model, SaveLogs, update, view } from './main'

const TODAY = '2026-10-20'

const twoPeriods = [
  { date: '2026-09-05', flow: 'Medium' as const },
  { date: '2026-09-06', flow: 'Heavy' as const },
  { date: '2026-09-07', flow: 'Light' as const },
  { date: '2026-10-03', flow: 'Medium' as const },
  { date: '2026-10-04', flow: 'Heavy' as const },
  { date: '2026-10-05', flow: 'Light' as const },
]

const baseModel: Model = {
  logs: twoPeriods,
  today: TODAY,
  selectedDate: TODAY,
  acknowledgedLateOn: Option.none(),
  tab: 'Today',
  isPredicting: true,
  isTooltipOpen: false,
  isLegendOpen: false,
  isMenuOpen: false,
  menuIndex: -1,
  isAboutOpen: false,
  isClearOpen: false,
}

const emptyModel: Model = {
  ...baseModel,
  logs: [],
}

describe('view', () => {
  test('empty state asks for the first period', () => {
    scene(
      { update, view },
      given(emptyModel),
      expect(role('heading', { name: 'cycle' })).toExist(),
      expect(role('status')).toContainText('Nothing logged'),
      expect(role('status')).toContainText(
        'Tap a day below to log your period.',
      ),
    )
  })

  test('shows the cycle day and the expected window as a range', () => {
    scene(
      { update, view },
      given(baseModel),
      expect(role('status')).toContainText('Day 18'),
      expect(role('status')).toContainText('Period expected'),
      expect(role('status')).toContainText('–'),
      expect(role('radio', { name: 'None' })).toExist(),
    )
  })

  test('logging today turns the status into a bleeding day', () => {
    const logged = [...twoPeriods, { date: TODAY, flow: 'Medium' as const }]

    scene(
      { update, view },
      given(baseModel),
      click(role('radio', { name: 'Medium' })),
      Command.expectExact(SaveLogs),
      Command.resolve(SaveLogs, Message.SucceededSaveLogs({ logs: logged })),
      expect(role('status')).toContainText('Bleeding · medium'),
    )
  })

  test('the flow group moves with the arrow keys', () => {
    scene(
      { update, view },
      given(baseModel),
      keydown(role('radiogroup', { name: 'Flow' }), 'ArrowRight'),
      Command.expectExact(SaveLogs),
      Command.resolve(
        SaveLogs,
        Message.SucceededSaveLogs({
          logs: [...twoPeriods, { date: TODAY, flow: 'Spotting' as const }],
        }),
      ),
      expect(role('radio', { name: 'Spotting' })).toBeChecked(),
    )
  })

  test('shows the estimate tooltip on hover', () => {
    scene(
      { update, view },
      given(baseModel),
      hover(role('button', { name: 'rough estimate' })),
      expect(
        text(
          'Fewer than three logged cycles, so the range is wide on purpose.',
        ),
      ).toExist(),
    )
  })

  test('switching to History lists the periods', () => {
    scene(
      { update, view },
      given(baseModel),
      click(role('tab', { name: 'History' })),
      expect(text('Periods')).toExist(),
      expect(text('3 Oct – 5 Oct')).toExist(),
      expect(role('status')).toBeAbsent(),
    )
  })

  test('the menu opens the explainer dialog, and Escape closes it', () => {
    scene(
      { update, view },
      given(baseModel),
      click(role('button', { name: 'Data' })),
      click(role('menuitem', { name: 'How this works' })),
      expect(role('dialog')).toExist(),
      expect(text('How the range is calculated')).toExist(),
      keydown(role('dialog'), 'Escape'),
      expect(role('dialog')).toBeAbsent(),
    )
  })

  test('clearing data empties the log', () => {
    scene(
      { update, view },
      given(baseModel),
      click(role('button', { name: 'Data' })),
      click(role('menuitem', { name: 'Clear all data' })),
      expect(text('Clear all data?')).toExist(),
      click(role('button', { name: 'Clear everything' })),
      Command.expectExact(SaveLogs),
      Command.resolve(SaveLogs, Message.SucceededSaveLogs({ logs: [] })),
      expect(role('status')).toContainText('Nothing logged'),
    )
  })

  test('keeps the in-memory logs when saving fails', () => {
    scene(
      { update, view },
      given(baseModel),
      click(role('radio', { name: 'Heavy' })),
      Command.expectExact(SaveLogs),
      Command.resolve(SaveLogs, Message.FailedSaveLogs()),
      expect(role('status')).toContainText('Bleeding · heavy'),
    )
  })
})
