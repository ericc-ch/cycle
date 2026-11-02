import { Option } from 'effect'
import { Command, click, expect, given, role, scene, text } from 'foldkit/scene'
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

const modelWithTwoPeriods: Model = {
  logs: twoPeriods,
  today: TODAY,
  selectedDate: TODAY,
  acknowledgedLateOn: Option.none(),
}

const emptyModel: Model = {
  logs: [],
  today: TODAY,
  selectedDate: TODAY,
  acknowledgedLateOn: Option.none(),
}

const overdueModel: Model = {
  ...modelWithTwoPeriods,
  today: '2026-11-10',
  selectedDate: '2026-11-10',
}

describe('view', () => {
  test('empty state asks for the first period', () => {
    scene(
      { update, view },
      given(emptyModel),
      expect(role('heading', { name: 'cycle' })).toExist(),
      expect(role('status')).toContainText('Nothing logged yet'),
      expect(role('status')).toContainText('Tap a day to log your period.'),
    )
  })

  test('shows the cycle day and the expected window as a range', () => {
    scene(
      { update, view },
      given(modelWithTwoPeriods),
      expect(role('status')).toContainText('Day 18'),
      expect(role('status')).toContainText('Period expected'),
      expect(role('status')).toContainText('–'),
    )
  })

  test('logging today turns the status into a bleeding day', () => {
    const logged = [...twoPeriods, { date: TODAY, flow: 'Medium' as const }]

    scene(
      { update, view },
      given(modelWithTwoPeriods),
      click(role('button', { name: 'Medium' })),
      Command.expectExact(SaveLogs),
      Command.resolve(SaveLogs, Message.SucceededSaveLogs({ logs: logged })),
      expect(role('status')).toContainText('Bleeding · medium'),
    )
  })

  test('clearing the selected day removes it again', () => {
    const withToday = [...twoPeriods, { date: TODAY, flow: 'Heavy' as const }]

    scene(
      { update, view },
      given({ ...modelWithTwoPeriods, logs: withToday }),
      click(role('button', { name: 'None' })),
      Command.expectExact(SaveLogs),
      Command.resolve(
        SaveLogs,
        Message.SucceededSaveLogs({ logs: twoPeriods }),
      ),
      expect(role('status')).toContainText('Period expected'),
    )
  })

  test('an overdue cycle offers a calm explanation instead of an alarm', () => {
    scene(
      { update, view },
      given(overdueModel),
      expect(
        text(
          '9 days later than usual. That happens. Two likely reasons: a period you did not log, or a late one.',
        ),
      ).toExist(),
      click(role('button', { name: "It's just late" })),
      expect(
        text(
          'Counting days without alarm. Tap a day above if you find the missing period later.',
        ),
      ).toExist(),
    )
  })

  test('keeps the in-memory logs when saving fails', () => {
    scene(
      { update, view },
      given(modelWithTwoPeriods),
      click(role('button', { name: 'Heavy' })),
      Command.expectExact(SaveLogs),
      Command.resolve(SaveLogs, Message.FailedSaveLogs()),
      expect(role('status')).toContainText('Bleeding · heavy'),
    )
  })
})
