import { beforeEach, describe, expect, test } from 'vitest'

import { RegistryProvider } from '@effect/atom-react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { snapshotFromLogs } from '@cycle/sync'

import { App, router } from './app'
import { type PlainDate, addDays, parsePlainDate } from './domain'
import { type Model, createModel, modelAtom, reducer } from './state'

const date = (value: string): PlainDate => {
  const parsed = parsePlainDate(value)

  if (parsed === null) {
    throw new Error(`not a date: ${value}`)
  }

  return parsed
}

const TODAY = date('2026-10-20')

const twoPeriods = [
  { date: date('2026-09-05'), flow: 'Bleeding' as const },
  { date: date('2026-09-06'), flow: 'Bleeding' as const },
  { date: date('2026-09-07'), flow: 'Bleeding' as const },
  { date: date('2026-10-03'), flow: 'Bleeding' as const },
  { date: date('2026-10-04'), flow: 'Bleeding' as const },
  { date: date('2026-10-05'), flow: 'Bleeding' as const },
]

const run = (
  start: string,
  days = 3,
): ReadonlyArray<{ date: PlainDate; flow: 'Bleeding' }> =>
  Array.from({ length: days }, (_, offset) => ({
    date: addDays(date(start), offset),
    flow: 'Bleeding' as const,
  }))

// Three 30 day cycles, then a 51 day gap: longer than 1.6 x her median, so
// the app should read it as a period she never logged.
const missedLog = [
  ...run('2026-06-01'),
  ...run('2026-07-01'),
  ...run('2026-07-31'),
  ...run('2026-08-30'),
  ...run('2026-10-20'),
]

const baseModel = createModel(TODAY, twoPeriods)
const emptyModel = createModel(TODAY, [])
const missedLogModel = createModel(TODAY, missedLog)

const renderApp = (initial: Model) =>
  render(
    <RegistryProvider initialValues={[[modelAtom, initial]]}>
      <App />
    </RegistryProvider>,
  )

const openEditMode = async (
  user: ReturnType<typeof userEvent.setup>,
  dayName = /Tuesday, 20 October 2026/,
) => {
  const day = screen.getByRole('button', { name: dayName })
  await user.pointer([{ target: day, keys: '[MouseLeft>]' }])
  await new Promise(resolve => setTimeout(resolve, 320))
  await user.pointer([{ target: day, keys: '[/MouseLeft]' }])
}

const isBoxed = (value: string): boolean =>
  document
    .querySelector(`[data-slot="calendar-day"][data-date="${value}"]`)
    ?.classList.contains('border-fg-0') ?? false

const draftDays = (): number =>
  Number(
    document
      .querySelector('[data-slot="edit-banner"]')
      ?.getAttribute('data-draft-days'),
  )

const editState = (): string | null =>
  document
    .querySelector('[data-slot="edit-banner"]')
    ?.getAttribute('data-state') ?? null

describe('view', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  test('empty state shows the calendar and hold hint', () => {
    renderApp(emptyModel)

    expect(screen.getByRole('grid', { name: /Calendar/ })).toBeTruthy()
    expect(
      screen.getByText('Hold a day to start logging.'),
    ).toBeTruthy()
  })

  test('the calendar is read-only until a day is held', async () => {
    const user = userEvent.setup()
    renderApp(baseModel)

    await user.click(
      screen.getByRole('button', { name: /Tuesday, 20 October 2026/ }),
    )

    expect(editState()).toBeNull()
    expect(localStorage.getItem('cycle.logs')).toBeNull()
  })

  test('a hold on a read-only day opens the edit mode there', async () => {
    const user = userEvent.setup()
    renderApp(baseModel)

    const day = screen.getByRole('button', {
      name: /Saturday, 17 October 2026/,
    })

    await user.pointer([{ target: day, keys: '[MouseLeft>]' }])
    await new Promise(resolve => setTimeout(resolve, 320))

    expect(editState()).toBe('clean')
    expect(isBoxed('2026-10-17')).toBe(true)

    await user.pointer([{ target: day, keys: '[/MouseLeft]' }])

    expect(editState()).toBe('clean')
    expect(isBoxed('2026-10-17')).toBe(true)
    expect(localStorage.getItem('cycle.logs')).toBeNull()
  })

  test('saving writes the painted day to storage', async () => {
    const user = userEvent.setup()
    renderApp(baseModel)

    await openEditMode(user)
    await user.click(
      screen.getByRole('button', { name: /Tuesday, 20 October 2026/ }),
    )

    expect(editState()).toBe('dirty')
    expect(localStorage.getItem('cycle.logs')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Save' }))

    const stored = JSON.parse(localStorage.getItem('cycle.logs') ?? '[]')

    expect(
      stored.some((log: { date: string }) => log.date === '2026-10-20'),
    ).toBe(true)
    expect(editState()).toBeNull()
  })

  test('Cancel discards the draft', async () => {
    const user = userEvent.setup()
    renderApp(baseModel)

    await openEditMode(user)
    await user.click(
      screen.getByRole('button', { name: /Tuesday, 20 October 2026/ }),
    )
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(localStorage.getItem('cycle.logs')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
  })

  test('both flow options are radios in one named group', async () => {
    const user = userEvent.setup()
    renderApp(baseModel)

    await openEditMode(user)

    expect(screen.getByRole('radiogroup', { name: 'Flow' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Bleeding' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Spotting' })).toBeTruthy()
  })

  test('dragging across days paints a range', async () => {
    const user = userEvent.setup()
    renderApp(baseModel)

    await openEditMode(user)

    const start = screen.getByRole('button', {
      name: /Saturday, 17 October 2026/,
    })
    const end = screen.getByRole('button', {
      name: /Tuesday, 20 October 2026/,
    })

    await user.pointer([
      { target: start, keys: '[MouseLeft>]' },
      { target: end },
      { target: end, keys: '[/MouseLeft]' },
    ])

    expect(editState()).toBe('dirty')
    expect(localStorage.getItem('cycle.logs')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Save' }))

    const stored = JSON.parse(localStorage.getItem('cycle.logs') ?? '[]')

    expect(stored.map((log: { date: string }) => log.date)).toContain(
      '2026-10-17',
    )
  })

  test('tapping a painted day clears it', async () => {
    const user = userEvent.setup()
    renderApp(baseModel)

    await openEditMode(user)

    const before = draftDays()

    await user.click(
      screen.getByRole('button', { name: /Saturday, 3 October 2026/ }),
    )

    expect(editState()).toBe('dirty')
    expect(draftDays()).toBe(before - 1)

    await user.click(screen.getByRole('button', { name: 'Save' }))

    const stored = JSON.parse(localStorage.getItem('cycle.logs') ?? '[]')

    expect(stored.map((log: { date: string }) => log.date)).not.toContain(
      '2026-10-03',
    )
  })

  test('tapping the same day twice puts it back', async () => {
    const user = userEvent.setup()
    renderApp(baseModel)

    const day = screen.getByRole('button', {
      name: /Tuesday, 20 October 2026/,
    })

    await openEditMode(user)
    await user.click(day)

    expect(editState()).toBe('dirty')

    await user.click(day)

    expect(editState()).toBe('clean')
    expect(localStorage.getItem('cycle.logs')).toBeNull()
  })

  test('tapping a day with another flow repaints it', async () => {
    const user = userEvent.setup()
    renderApp(baseModel)

    await openEditMode(user)
    await user.click(screen.getByRole('radio', { name: 'Spotting' }))
    await user.click(
      screen.getByRole('button', { name: /Saturday, 3 October 2026/ }),
    )
    await user.click(screen.getByRole('button', { name: 'Save' }))

    const stored = JSON.parse(localStorage.getItem('cycle.logs') ?? '[]')

    expect(
      stored.find((log: { date: string }) => log.date === '2026-10-03')?.flow,
    ).toBe('Spotting')
  })

  test('dragging across painted days clears the span', async () => {
    const user = userEvent.setup()
    renderApp(baseModel)

    await openEditMode(user)

    const start = screen.getByRole('button', {
      name: /Saturday, 3 October 2026/,
    })
    const end = screen.getByRole('button', {
      name: /Monday, 5 October 2026/,
    })

    await user.pointer([
      { target: start, keys: '[MouseLeft>]' },
      { target: end },
      { target: end, keys: '[/MouseLeft]' },
    ])
    await user.click(screen.getByRole('button', { name: 'Save' }))

    const stored: ReadonlyArray<{ date: string }> = JSON.parse(
      localStorage.getItem('cycle.logs') ?? '[]',
    )
    const dates = stored.map(log => log.date)

    expect(dates).not.toContain('2026-10-03')
    expect(dates).not.toContain('2026-10-05')
    expect(dates).toContain('2026-09-05')
  })

  test('a drag flips each day in the span', async () => {
    const user = userEvent.setup()
    renderApp(baseModel)

    await openEditMode(user)

    // 3-5 October are saved. Drag from the 8th back to the 3rd: the saved
    // days leave the draft and the empty ones take the pen.
    const start = screen.getByRole('button', {
      name: /Thursday, 8 October 2026/,
    })
    const end = screen.getByRole('button', {
      name: /Saturday, 3 October 2026/,
    })

    await user.pointer([
      { target: start, keys: '[MouseLeft>]' },
      { target: end },
      { target: end, keys: '[/MouseLeft]' },
    ])
    await user.click(screen.getByRole('button', { name: 'Save' }))

    const stored: ReadonlyArray<{ date: string }> = JSON.parse(
      localStorage.getItem('cycle.logs') ?? '[]',
    )
    const dates = stored.map(log => log.date)

    expect(dates).not.toContain('2026-10-03')
    expect(dates).not.toContain('2026-10-04')
    expect(dates).not.toContain('2026-10-05')
    expect(dates).toEqual(
      expect.arrayContaining(['2026-10-06', '2026-10-07', '2026-10-08']),
    )
    expect(dates).toContain('2026-09-05')
  })

  test('a drag repaints a day that holds the other flow', async () => {
    const user = userEvent.setup()
    renderApp(baseModel)

    await openEditMode(user)
    await user.click(screen.getByRole('radio', { name: 'Spotting' }))
    await user.click(
      screen.getByRole('button', { name: /Tuesday, 6 October 2026/ }),
    )
    await user.click(screen.getByRole('radio', { name: 'Bleeding' }))

    // 3-5 October are saved as bleeding and the 6th is spotting. The bleeding
    // brush clears its own days and repaints the spotting one.
    const start = screen.getByRole('button', {
      name: /Saturday, 3 October 2026/,
    })
    const end = screen.getByRole('button', {
      name: /Tuesday, 6 October 2026/,
    })

    await user.pointer([
      { target: start, keys: '[MouseLeft>]' },
      { target: end },
      { target: end, keys: '[/MouseLeft]' },
    ])
    await user.click(screen.getByRole('button', { name: 'Save' }))

    const stored: ReadonlyArray<{ date: string; flow: string }> = JSON.parse(
      localStorage.getItem('cycle.logs') ?? '[]',
    )
    const dates = stored.map(log => log.date)

    expect(dates).not.toContain('2026-10-03')
    expect(dates.filter(date => date === '2026-10-06')).toHaveLength(1)
    expect(stored.find(log => log.date === '2026-10-06')?.flow).toBe('Bleeding')
    expect(dates).toContain('2026-09-05')
  })

  test('Enter on a focused day paints it', async () => {
    const user = userEvent.setup()
    renderApp(baseModel)

    await openEditMode(user)

    const day = screen.getByRole('button', {
      name: /Tuesday, 20 October 2026/,
    })

    day.focus()
    await user.keyboard('{Enter}')

    expect(editState()).toBe('dirty')
  })

  test('pressing a day boxes it before the drag moves', async () => {
    const user = userEvent.setup()
    renderApp(baseModel)

    await openEditMode(user)

    const start = screen.getByRole('button', {
      name: /Saturday, 17 October 2026/,
    })

    await user.pointer([{ target: start, keys: '[MouseLeft>]' }])

    expect(start.className).toContain('border-fg-0')

    await user.pointer([{ target: start, keys: '[/MouseLeft]' }])
  })

  test('switching to History lists the periods', async () => {
    const user = userEvent.setup()
    renderApp(baseModel)

    expect(
      screen
        .getByRole('tablist', { name: 'Sections' })
        .getAttribute('data-slot'),
    ).toBe('tabs-list')
    expect(
      screen.getByRole('tab', { name: 'Calendar' }).getAttribute('data-slot'),
    ).toBe('tabs-trigger')
    expect(
      screen
        .getByRole('tab', { name: 'Calendar' })
        .getAttribute('data-selected'),
    ).toBe('true')

    await user.click(screen.getByRole('tab', { name: 'History' }))

    expect(screen.getByText('Periods')).toBeTruthy()
    expect(screen.getByText('3 Oct – 5 Oct')).toBeTruthy()
    expect(screen.queryByRole('grid', { name: /Calendar/ })).toBeNull()
  })

  test('History marks a gap that looks like a missed log', async () => {
    const user = userEvent.setup()
    renderApp(missedLogModel)

    await user.click(screen.getByRole('tab', { name: 'History' }))

    expect(screen.getByText(/Probably a period you did not log/)).toBeTruthy()

    await router.navigate({ to: '/' })
  })

  test('the calendar shows the month and today', () => {
    renderApp(baseModel)

    expect(screen.getByRole('grid', { name: /Calendar/ })).toBeTruthy()
    expect(screen.getByText('October 2026')).toBeTruthy()
    expect(
      screen.getByRole('button', { name: /Tuesday, 20 October 2026/ }),
    ).toBeTruthy()
  })

  test('About explains the marks and range inline', async () => {
    const user = userEvent.setup()
    renderApp(baseModel)

    await user.click(screen.getByRole('tab', { name: 'About' }))

    expect(
      screen.getByRole('heading', { name: 'How the range is calculated' }),
    ).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Marks' })).toBeTruthy()
    expect(screen.getByText('Predicted')).toBeTruthy()
  })

  test('the clear dialog deletes every day', async () => {
    const user = userEvent.setup()
    renderApp(baseModel)

    await user.click(screen.getByRole('tab', { name: 'About' }))
    await user.click(screen.getByRole('button', { name: 'Clear all data' }))

    const dialog = await screen.findByRole('alertdialog')

    await user.click(
      within(dialog).getByRole('button', { name: 'Clear everything' }),
    )
    await user.click(screen.getByRole('tab', { name: 'Calendar' }))

    expect(localStorage.getItem('cycle.logs')).toBe('[]')
  })
})

describe('sync reducer invariants', () => {
  test('SyncSucceeded with unchanged snapshot keeps vault reference', () => {
    const enabled = reducer(baseModel, {
      type: 'SyncEnabled',
      username: 'alice',
      snapshot: baseModel.vault,
    })
    const again = reducer(enabled, {
      type: 'SyncSucceeded',
      username: 'alice',
      snapshot: { ...enabled.vault, entries: [...enabled.vault.entries] },
    })

    expect(again.vault).toBe(enabled.vault)
  })

  test('SyncSucceeded after SyncDisabled does not resurrect sync', () => {
    const enabled = reducer(baseModel, {
      type: 'SyncEnabled',
      username: 'alice',
      snapshot: baseModel.vault,
    })
    const disabled = reducer(enabled, { type: 'SyncDisabled' })
    const late = reducer(disabled, {
      type: 'SyncSucceeded',
      username: 'alice',
      snapshot: baseModel.vault,
    })

    expect(late.sync.status).toBe('off')
  })

  test('a sync landing mid-edit does not delete remote days on Save', () => {
    const enabled = reducer(baseModel, {
      type: 'SyncEnabled',
      username: 'alice',
      snapshot: baseModel.vault,
    })
    const editing = reducer(enabled, {
      type: 'StartedEditing',
      date: date('2026-10-20'),
    })
    const painted = reducer(editing, {
      type: 'PaintedDay',
      date: date('2026-10-20'),
    })
    const remote = snapshotFromLogs(
      [...twoPeriods, { date: date('2026-10-15'), flow: 'Spotting' }],
      500,
    )
    const syncedMidEdit = reducer(painted, {
      type: 'SyncSucceeded',
      username: 'alice',
      snapshot: remote,
    })
    const saved = reducer(syncedMidEdit, { type: 'SavedEditing' })
    const savedDates = saved.logs.map(log => log.date.toString())

    expect(savedDates).toContain('2026-10-15')
    expect(savedDates).toContain('2026-10-20')
  })

  test('SyncSucceeded from a different username is ignored', () => {
    const enabled = reducer(baseModel, {
      type: 'SyncEnabled',
      username: 'bob',
      snapshot: baseModel.vault,
    })
    const stale = reducer(enabled, {
      type: 'SyncSucceeded',
      username: 'alice',
      snapshot: snapshotFromLogs(
        [{ date: date('2026-10-25'), flow: 'Bleeding' }],
        999,
      ),
    })

    expect(stale).toBe(enabled)
  })
})
