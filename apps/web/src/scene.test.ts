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

import { RadioGroup, Tabs } from '@cycle/ui'

import { Message, type Model, SaveLogs, init, update, view } from './main'

const TODAY = '2026-10-20'

const twoPeriods = [
  { date: '2026-09-05', flow: 'Medium' as const },
  { date: '2026-09-06', flow: 'Heavy' as const },
  { date: '2026-09-07', flow: 'Light' as const },
  { date: '2026-10-03', flow: 'Medium' as const },
  { date: '2026-10-04', flow: 'Heavy' as const },
  { date: '2026-10-05', flow: 'Light' as const },
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
      expect(role('radio', { name: 'None' })).toExist(),
    )
  })

  test('logging today turns the status into a bleeding day', () => {
    const logged = [...twoPeriods, { date: TODAY, flow: 'Medium' as const }]

    scene(
      { update, view },
      given(baseModel),
      click(role('radio', { name: 'Medium' })),
      Command.resolve(
        RadioGroup.FocusOption,
        RadioGroup.Message.CompletedFocusOption(),
      ),
      Command.resolve(SaveLogs, Message.SucceededSaveLogs({ logs: logged })),
      expect(role('status')).toContainText('Bleeding · medium'),
    )
  })

  test('the flow group moves with the arrow keys', () => {
    scene(
      { update, view },
      given(baseModel),
      keydown(role('radio', { name: 'None' }), 'ArrowRight'),
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

  test('switching to History lists the periods', () => {
    scene(
      { update, view },
      given(baseModel),
      click(role('tab', { name: 'History' })),
      Command.resolve(Tabs.FocusTab, Tabs.Message.CompletedFocusTab()),
      expect(text('Periods')).toExist(),
      expect(text('3 Oct – 5 Oct')).toExist(),
      expect(role('status')).toBeAbsent(),
    )
  })

  test('picking a day moves the selection', () => {
    scene(
      { update, view },
      given(baseModel),
      click(role('button', { name: /Tue 13,/ })),
      expect(role('button', { name: /Tue 13,/ })).toHaveAttr(
        'aria-pressed',
        'true',
      ),
    )
  })
})
