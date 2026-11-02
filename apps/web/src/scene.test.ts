import { Option } from 'effect'
import {
  Command,
  click,
  expect,
  given,
  keydown,
  role,
  scene,
  text,
} from 'foldkit/scene'
import { describe, test } from 'vitest'

import { RadioGroup, Tabs } from './components/ui'
import { Message, type Model, SaveLogs, init, update, view } from './main'

const TODAY = '2026-10-20'

const twoPeriods = [
  { date: '2026-09-05', flow: 'Bleeding' as const },
  { date: '2026-09-06', flow: 'Bleeding' as const },
  { date: '2026-09-07', flow: 'Bleeding' as const },
  { date: '2026-10-03', flow: 'Bleeding' as const },
  { date: '2026-10-04', flow: 'Bleeding' as const },
  { date: '2026-10-05', flow: 'Bleeding' as const },
]

const baseModel: Model = init({
  logs: Option.some(twoPeriods),
  today: TODAY,
}).model

const emptyModel: Model = init({ logs: Option.none(), today: TODAY }).model

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
      expect(role('radio', { name: 'Spotting' })).toHaveAttr(
        'data-slot',
        'radio-group-item',
      ),
      expect(role('radio', { name: 'Spotting' })).toHaveAttr(
        'data-state',
        'unchecked',
      ),
    )
  })

  test('logging today turns the status into a bleeding day', () => {
    const logged = [...twoPeriods, { date: TODAY, flow: 'Bleeding' as const }]

    scene(
      { update, view },
      given(baseModel),
      click(role('radio', { name: 'Bleeding' })),
      Command.resolve(
        RadioGroup.FocusOption,
        RadioGroup.Message.CompletedFocusOption(),
      ),
      Command.resolve(SaveLogs, Message.SucceededSaveLogs({ logs: logged })),
      expect(role('status')).toContainText('Bleeding'),
    )
  })

  test('the flow group moves with the arrow keys', () => {
    scene(
      { update, view },
      given(baseModel),
      keydown(role('radio', { name: 'Bleeding' }), 'ArrowRight'),
      Command.resolve(
        RadioGroup.FocusOption,
        RadioGroup.Message.CompletedFocusOption(),
      ),
      Command.resolve(
        SaveLogs,
        Message.SucceededSaveLogs({
          logs: [...twoPeriods, { date: TODAY, flow: 'Spotting' as const }],
        }),
      ),
      expect(role('radio', { name: 'Spotting' })).toBeChecked(),
    )
  })

  test('a range is armed, previewed and committed in one save', () => {
    scene(
      { update, view },
      given(baseModel),
      click(role('button', { name: 'Mark a range' })),
      click(role('button', { name: 'Saturday, October 17, 2026' })),
      expect(text('17 – 20 Oct')).toExist(),
      click(role('button', { name: 'Mark 4 days as bleeding' })),
      Command.resolve(
        SaveLogs,
        Message.SucceededSaveLogs({
          logs: [
            ...twoPeriods,
            { date: '2026-10-17', flow: 'Bleeding' as const },
            { date: '2026-10-18', flow: 'Bleeding' as const },
            { date: '2026-10-19', flow: 'Bleeding' as const },
            { date: TODAY, flow: 'Bleeding' as const },
          ],
        }),
      ),
      expect(text('Sat 17 Oct')).toExist(),
      expect(role('button', { name: 'Mark a range' })).toExist(),
    )
  })

  test('switching to History lists the periods', () => {
    scene(
      { update, view },
      given(baseModel),
      expect(role('tablist', { name: 'Sections' })).toHaveAttr(
        'data-slot',
        'tabs-list',
      ),
      expect(role('tab', { name: 'Today' })).toHaveAttr(
        'data-slot',
        'tabs-trigger',
      ),
      expect(role('tab', { name: 'Today' })).toHaveAttr('data-state', 'active'),
      click(role('tab', { name: 'History' })),
      Command.resolve(Tabs.FocusTab, Tabs.Message.CompletedFocusTab()),
      expect(text('Periods')).toExist(),
      expect(text('3 Oct – 5 Oct')).toExist(),
      expect(role('status')).toBeAbsent(),
    )
  })

  test('the calendar shows the month and today', () => {
    scene(
      { update, view },
      given(baseModel),
      expect(role('grid', { name: /Calendar/ })).toExist(),
      expect(role('heading', { name: 'October 2026' })).toExist(),
      expect(role('button', { name: 'Tuesday, October 20, 2026' })).toExist(),
    )
  })
})
