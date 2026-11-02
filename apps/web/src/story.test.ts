import { Option } from 'effect'
import { Command, given, message, model, story } from 'foldkit/story'
import { describe, expect, test } from 'vitest'

import { Menu, Tabs } from './components/ui'
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

const baseModel: Model = init({
  logs: Option.some([...septemberPeriod, ...octoberPeriod]),
  today: TODAY,
}).model

describe('init', () => {
  test('uses the flags logs and today', () => {
    const result = init({
      logs: Option.some(octoberPeriod),
      today: TODAY,
    })

    expect(result.model.logs).toStrictEqual(octoberPeriod)
    expect(result.model.today).toBe(TODAY)
    expect(result.model.selectedDate).toBe(TODAY)
    expect(result.model.tab).toBe('Today')
    expect(result.model.isPredicting).toBe(true)
  })

  test('starts empty when nothing was stored', () => {
    const result = init({ logs: Option.none(), today: TODAY })

    expect(result.model.logs).toStrictEqual([])
  })

  test('starts with every panel closed', () => {
    const result = init({ logs: Option.none(), today: TODAY })

    expect(result.model.aboutDialog.isOpen).toBe(false)
    expect(result.model.clearDialog.isOpen).toBe(false)
    expect(result.model.menu.isOpen).toBe(false)
    expect(result.model.legend.isOpen).toBe(false)
    expect(result.model.tooltip.isOpen).toBe(false)
  })
})

describe('update', () => {
  test('SelectedDay moves the editor to that day', () => {
    story(
      update,
      given(baseModel),
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
      given(baseModel),
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
      given(baseModel),
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
      given(baseModel),
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
      given(baseModel),
      message(Message.AcknowledgedLate({ date: TODAY })),
      model(model => {
        expect(model.acknowledgedLateOn).toStrictEqual(Option.some(TODAY))
      }),
      Command.expectNone(),
    )
  })

  test('SetPrediction flips the prediction switch', () => {
    story(
      update,
      given(baseModel),
      message(Message.SetPrediction({ isPredicting: false })),
      model(model => {
        expect(model.isPredicting).toBe(false)
      }),
      Command.expectNone(),
    )
  })

  test('the tabs component moves the app to the chosen section', () => {
    const result = update(
      baseModel,
      Message.GotTabsMessage({
        message: Tabs.Message.SelectedTab({ index: 1, value: 'History' }),
      }),
    )

    expect(result.model.tab).toBe('History')
  })

  test('OpenedAbout opens the explainer dialog', () => {
    const result = update(baseModel, Message.OpenedAbout())

    expect(result.model.aboutDialog.isOpen).toBe(true)
  })

  test('the menu selection opens the matching dialog', () => {
    const result = update(
      baseModel,
      Message.GotMenuMessage({
        message: Menu.Message.SelectedItem({ index: 1, item: 'clear' }),
      }),
    )

    expect(result.model.clearDialog.isOpen).toBe(true)
    expect(result.model.aboutDialog.isOpen).toBe(false)
  })

  test('ClearedAllLogs empties the logs and saves', () => {
    const result = update(baseModel, Message.ClearedAllLogs())

    expect(result.model.logs).toStrictEqual([])
    expect(result.model.isPredicting).toBe(true)
  })

  test('FailedSaveLogs keeps the in-memory logs', () => {
    story(
      update,
      given({ ...baseModel, logs: [...octoberPeriod] }),
      message(Message.LoggedFlow({ date: TODAY, flow: 'Heavy' })),
      Command.expectExact(SaveLogs),
      Command.resolve(SaveLogs, Message.FailedSaveLogs()),
      model(model => {
        expect(model.logs).toHaveLength(octoberPeriod.length + 1)
      }),
    )
  })
})
