import { Option } from 'effect'
import { Command, given, message, model, story } from 'foldkit/story'
import { modifyFields } from 'foldkit/struct'
import { describe, expect, test } from 'vitest'

import { Message, type Model, SaveLogs, init, update } from './main'

const TODAY = '2026-10-20'

const septemberPeriod = [
  { date: '2026-09-05', flow: 'Medium' as const },
  { date: '2026-09-06', flow: 'Heavy' as const },
  { date: '2026-09-07', flow: 'Light' as const },
]

const octoberPeriod = [
  { date: '2026-10-03', flow: 'Medium' as const },
  { date: '2026-10-04', flow: 'Heavy' as const },
  { date: '2026-10-05', flow: 'Light' as const },
]

const modelWithTwoPeriods: Model = {
  logs: [...septemberPeriod, ...octoberPeriod],
  today: TODAY,
  selectedDate: TODAY,
  acknowledgedLateOn: Option.none(),
}

describe('init', () => {
  test('uses the flags logs and today', () => {
    const result = init({
      logs: Option.some(octoberPeriod),
      today: TODAY,
    })

    expect(result.model.logs).toStrictEqual(octoberPeriod)
    expect(result.model.today).toBe(TODAY)
    expect(result.model.selectedDate).toBe(TODAY)
  })

  test('starts empty when nothing was stored', () => {
    const result = init({ logs: Option.none(), today: TODAY })

    expect(result.model.logs).toStrictEqual([])
  })
})

describe('update', () => {
  test('SelectedDay moves the editor to that day', () => {
    story(
      update,
      given(modelWithTwoPeriods),
      message(Message.SelectedDay({ date: '2026-10-06' })),
      model(model => {
        expect(model.selectedDate).toBe('2026-10-06')
      }),
      Command.expectNone(),
    )
  })

  test('LoggedFlow appends a day and saves', () => {
    const expectedLogs = [
      ...septemberPeriod,
      ...octoberPeriod,
      { date: TODAY, flow: 'Medium' as const },
    ]

    story(
      update,
      given(modelWithTwoPeriods),
      message(Message.LoggedFlow({ date: TODAY, flow: 'Medium' })),
      Command.expectExact(SaveLogs),
      Command.resolve(
        SaveLogs,
        Message.SucceededSaveLogs({ logs: expectedLogs }),
      ),
      model(model => {
        expect(model.logs).toStrictEqual(expectedLogs)
      }),
    )
  })

  test('LoggedFlow replaces the flow already stored for that day', () => {
    const expectedLogs = [
      ...septemberPeriod,
      { date: '2026-10-03', flow: 'Light' as const },
      { date: '2026-10-04', flow: 'Heavy' as const },
      { date: '2026-10-05', flow: 'Light' as const },
    ]

    story(
      update,
      given(modelWithTwoPeriods),
      message(Message.LoggedFlow({ date: '2026-10-03', flow: 'Light' })),
      Command.expectExact(SaveLogs),
      Command.resolve(
        SaveLogs,
        Message.SucceededSaveLogs({ logs: expectedLogs }),
      ),
      model(model => {
        expect(model.logs).toStrictEqual(expectedLogs)
      }),
    )
  })

  test('ClearedDay removes the day from the logs', () => {
    const expectedLogs = [...septemberPeriod, ...octoberPeriod.slice(1)]

    story(
      update,
      given(modelWithTwoPeriods),
      message(Message.ClearedDay({ date: '2026-10-03' })),
      Command.expectExact(SaveLogs),
      Command.resolve(
        SaveLogs,
        Message.SucceededSaveLogs({ logs: expectedLogs }),
      ),
      model(model => {
        expect(model.logs).toStrictEqual(expectedLogs)
      }),
    )
  })

  test('AcknowledgedLate records the day without saving', () => {
    story(
      update,
      given(modelWithTwoPeriods),
      message(Message.AcknowledgedLate({ date: TODAY })),
      model(model => {
        expect(model.acknowledgedLateOn).toStrictEqual(Option.some(TODAY))
      }),
      Command.expectNone(),
    )
  })

  test('FailedSaveLogs keeps the in-memory logs', () => {
    story(
      update,
      given(
        modifyFields(modelWithTwoPeriods, { logs: () => [...octoberPeriod] }),
      ),
      message(Message.LoggedFlow({ date: TODAY, flow: 'Heavy' })),
      Command.expectExact(SaveLogs),
      Command.resolve(SaveLogs, Message.FailedSaveLogs()),
      model(model => {
        expect(model.logs).toHaveLength(octoberPeriod.length + 1)
      }),
    )
  })
})
