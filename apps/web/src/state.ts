import { Option, Schema } from 'effect'
import { Atom } from 'effect/reactivity'

import {
  type VaultSnapshot,
  VaultSnapshotSchema,
  applyLogsDiff,
  applyPrediction,
  logsFromSnapshot,
  mergeSnapshots,
  sameSnapshot,
  snapshotFromLogs,
} from '@cycle/sync'

import {
  type DayLog,
  type Flow,
  type PlainDate,
  type StoredFlow,
  datesBetween,
  flowAt,
  flowFromStored,
  formatPlainDate,
  logsSorted,
  parsePlainDate,
  periodsFrom,
  sameDay,
  todayPlainDate,
} from './domain'
import { clearSyncCredentials, loadSyncCredentials } from './sync'

const LOGS_STORAGE_KEY = 'cycle.logs'
const PREDICTING_STORAGE_KEY = 'cycle.predicting'
const VAULT_STORAGE_KEY = 'cycle.vault'

export type SyncState =
  | { readonly status: 'off' }
  | {
      readonly status: 'ready'
      readonly username: string
      readonly activity: 'idle' | 'syncing' | 'synced' | 'error'
      readonly error: string | null
    }

export type Tab = 'Calendar' | 'History' | 'About'
export const tabs: ReadonlyArray<Tab> = ['Calendar', 'History', 'About']

export type DialogName = 'about' | 'clear'

/** The working copy behind the explicit edit mode. Nothing in `logs` changes
 *  until `SavedEditing`, so a stray tap inside the mode costs nothing. */
export type Draft = {
  readonly baseLogs: ReadonlyArray<DayLog>
  readonly logs: ReadonlyArray<DayLog>
  readonly selectedDate: PlainDate
  readonly flow: Flow
  readonly rangeStart: PlainDate | null
  readonly rangeEnd: PlainDate | null
  readonly rangeBase: ReadonlyArray<DayLog> | null
}

export type Model = {
  readonly logs: ReadonlyArray<DayLog>
  readonly vault: VaultSnapshot
  readonly today: PlainDate
  readonly acknowledgedLateOn: PlainDate | null
  readonly tab: Tab
  readonly isPredicting: boolean
  readonly dialog: DialogName | null
  readonly draft: Draft | null
  readonly sync: SyncState
}

export type Action =
  | { readonly type: 'StartedEditing'; readonly date?: PlainDate }
  | { readonly type: 'SavedEditing' }
  | { readonly type: 'CancelledEditing' }
  | { readonly type: 'SetDraftFlow'; readonly flow: Flow }
  | { readonly type: 'PaintedDay'; readonly date: PlainDate }
  | {
      readonly type: 'DraggedRange'
      readonly start: PlainDate
      readonly end: PlainDate
    }
  | { readonly type: 'EndedRange' }
  | { readonly type: 'AcknowledgedLate'; readonly date: PlainDate }
  | { readonly type: 'SetPrediction'; readonly isPredicting: boolean }
  | { readonly type: 'SetTab'; readonly tab: Tab }
  | { readonly type: 'OpenedDialog'; readonly dialog: DialogName }
  | { readonly type: 'ClosedDialog' }
  | { readonly type: 'ImportedLogs'; readonly logs: ReadonlyArray<DayLog> }
  | { readonly type: 'ClearedAllLogs' }
  | { readonly type: 'SyncStarted' }
  | {
      readonly type: 'SyncEnabled'
      readonly username: string
      readonly snapshot: VaultSnapshot
    }
  | {
      readonly type: 'SyncSucceeded'
      readonly username: string
      readonly snapshot: VaultSnapshot
    }
  | { readonly type: 'SyncFailed'; readonly message: string }
  | { readonly type: 'SyncDisabled' }

const isStoredFlow = (value: unknown): value is StoredFlow =>
  value === 'Spotting' ||
  value === 'Light' ||
  value === 'Medium' ||
  value === 'Heavy' ||
  value === 'Bleeding'

export const parseStoredLogs = (raw: unknown): ReadonlyArray<DayLog> => {
  if (!Array.isArray(raw)) {
    return []
  }

  const logs: DayLog[] = []

  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue
    if (!('date' in entry) || !('flow' in entry)) continue
    if (typeof entry.date !== 'string') continue
    if (!isStoredFlow(entry.flow)) continue

    const date = parsePlainDate(entry.date)

    if (date === null) continue

    logs.push({ date, flow: flowFromStored(entry.flow) })
  }

  return logsSorted(logs)
}

/** Storage can fail in private mode or when the quota is full. Read and write
 *  are each wrapped once; the in-memory log is still usable. */
export const loadLogs = (): ReadonlyArray<DayLog> => {
  try {
    const raw = localStorage.getItem(LOGS_STORAGE_KEY)

    return raw === null ? [] : parseStoredLogs(JSON.parse(raw))
  } catch {
    return []
  }
}

/** Storage holds the text form: `JSON` has no date type, so a `PlainDate`
 *  is written as `YYYY-MM-DD` and read back through `parsePlainDate`. */
export const formatStoredLogs = (logs: ReadonlyArray<DayLog>): string =>
  JSON.stringify(
    logsSorted(logs).map(log => ({
      date: formatPlainDate(log.date),
      flow: log.flow,
    })),
    null,
    2,
  )

export const saveLogs = (logs: ReadonlyArray<DayLog>): void => {
  try {
    localStorage.setItem(LOGS_STORAGE_KEY, formatStoredLogs(logs))
  } catch {}
}

export const loadPredicting = (): boolean => {
  try {
    return localStorage.getItem(PREDICTING_STORAGE_KEY) !== 'false'
  } catch {
    return true
  }
}

export const savePredicting = (isPredicting: boolean): void => {
  try {
    localStorage.setItem(PREDICTING_STORAGE_KEY, String(isPredicting))
  } catch {}
}

export const loadVault = (): VaultSnapshot | null => {
  try {
    const raw = localStorage.getItem(VAULT_STORAGE_KEY)

    if (raw === null) {
      return null
    }

    return Option.getOrNull(
      Schema.decodeOption(Schema.fromJsonString(VaultSnapshotSchema))(raw),
    )
  } catch {
    return null
  }
}

export const saveVault = (vault: VaultSnapshot): void => {
  try {
    localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(vault))
  } catch {}
}

export const createModel = (
  today: PlainDate,
  logs: ReadonlyArray<DayLog>,
  isPredicting = true,
  sync: SyncState = { status: 'off' },
  vault?: VaultSnapshot,
): Model => {
  const sorted = logsSorted(logs)
  const initialVault = vault ?? snapshotFromLogs(sorted, isPredicting, 1)

  return {
    logs: sorted,
    vault: initialVault,
    today,
    acknowledgedLateOn: null,
    tab: 'Calendar',
    isPredicting,
    dialog: null,
    draft: null,
    sync,
  }
}

export const initModel = (): Model => {
  const credentials = loadSyncCredentials()
  const sync: SyncState =
    credentials === null
      ? { status: 'off' }
      : {
          status: 'ready',
          username: credentials.username,
          activity: 'idle',
          error: null,
        }
  const logs = loadLogs()
  const isPredicting = loadPredicting()
  const storedVault = loadVault()
  const vault =
    storedVault === null
      ? snapshotFromLogs(logs, isPredicting, 1)
      : applyPrediction(applyLogsDiff(storedVault, logs), isPredicting)

  return createModel(todayPlainDate(), logs, isPredicting, sync, vault)
}

const upsertLog = (
  logs: ReadonlyArray<DayLog>,
  date: PlainDate,
  flow: Flow,
): ReadonlyArray<DayLog> =>
  logsSorted([...logs.filter(log => !sameDay(log.date, date)), { date, flow }])

/** The day already carries the pen's flow, so the gesture takes it away
 *  instead of painting it again. */
const hasPen = (
  logs: ReadonlyArray<DayLog>,
  date: PlainDate,
  flow: Flow,
): boolean => flowAt(logs, date) === flow

const clearLog = (
  logs: ReadonlyArray<DayLog>,
  date: PlainDate,
): ReadonlyArray<DayLog> => logs.filter(log => !sameDay(log.date, date))

/** Every day in the span flips on its own: one that already carries the pen
 *  leaves, one that does not takes it. `base` is the draft before the gesture
 *  began, so moving the far end recomputes the span instead of stacking. */
const toggleSpan = (
  base: ReadonlyArray<DayLog>,
  start: PlainDate,
  end: PlainDate,
  flow: Flow,
): ReadonlyArray<DayLog> =>
  datesBetween(start, end).reduce(
    (logs, date) =>
      hasPen(base, date, flow)
        ? clearLog(logs, date)
        : upsertLog(logs, date, flow),
    base,
  )

export const reducer = (model: Model, action: Action): Model => {
  switch (action.type) {
    case 'StartedEditing':
      return {
        ...model,
        draft: {
          baseLogs: model.logs,
          logs: model.logs,
          selectedDate: action.date ?? model.today,
          flow: 'Bleeding',
          rangeStart: null,
          rangeEnd: null,
          rangeBase: null,
        },
      }

    case 'SavedEditing': {
      if (model.draft === null) {
        return model
      }

      const { baseLogs, logs: draftLogs } = model.draft
      const baseByDate = new Map(
        baseLogs.map(log => [formatPlainDate(log.date), log.flow]),
      )
      const draftByDate = new Map(
        draftLogs.map(log => [formatPlainDate(log.date), log.flow]),
      )
      const nextByDate = new Map(
        model.logs.map(log => [formatPlainDate(log.date), log]),
      )

      for (const log of draftLogs) {
        const key = formatPlainDate(log.date)

        if (baseByDate.get(key) !== log.flow) {
          nextByDate.set(key, log)
        }
      }

      for (const log of baseLogs) {
        const key = formatPlainDate(log.date)

        if (!draftByDate.has(key)) {
          nextByDate.delete(key)
        }
      }

      const nextLogs = logsSorted([...nextByDate.values()])

      return {
        ...model,
        logs: nextLogs,
        vault: applyLogsDiff(model.vault, nextLogs),
        draft: null,
      }
    }

    case 'CancelledEditing':
      return { ...model, draft: null }

    case 'SetDraftFlow':
      return model.draft === null
        ? model
        : { ...model, draft: { ...model.draft, flow: action.flow } }

    case 'PaintedDay': {
      if (model.draft === null) {
        return model
      }

      const draft = model.draft

      return {
        ...model,
        draft: {
          ...draft,
          logs: hasPen(draft.logs, action.date, draft.flow)
            ? clearLog(draft.logs, action.date)
            : upsertLog(draft.logs, action.date, draft.flow),
          selectedDate: action.date,
        },
      }
    }

    case 'DraggedRange': {
      if (model.draft === null) {
        return model
      }

      const draft = model.draft
      const base = draft.rangeBase ?? draft.logs

      return {
        ...model,
        draft: {
          ...draft,
          logs: toggleSpan(base, action.start, action.end, draft.flow),
          selectedDate: action.end,
          rangeStart: action.start,
          rangeEnd: action.end,
          rangeBase: base,
        },
      }
    }

    case 'EndedRange':
      return model.draft === null
        ? model
        : {
            ...model,
            draft: {
              ...model.draft,
              rangeStart: null,
              rangeEnd: null,
              rangeBase: null,
            },
          }

    case 'AcknowledgedLate':
      return { ...model, acknowledgedLateOn: action.date }

    case 'SetPrediction':
      return {
        ...model,
        isPredicting: action.isPredicting,
        vault: applyPrediction(model.vault, action.isPredicting),
      }

    case 'SetTab':
      return { ...model, tab: action.tab }

    case 'OpenedDialog':
      return { ...model, dialog: action.dialog }

    case 'ClosedDialog':
      return { ...model, dialog: null }

    case 'ImportedLogs': {
      const sorted = logsSorted(action.logs)

      return {
        ...model,
        logs: sorted,
        vault: applyLogsDiff(model.vault, sorted),
        dialog: null,
        draft: null,
      }
    }

    case 'ClearedAllLogs':
      return {
        ...model,
        logs: [],
        isPredicting: true,
        vault: applyPrediction(applyLogsDiff(model.vault, []), true),
        dialog: null,
        draft: null,
      }

    case 'SyncStarted':
      return model.sync.status === 'ready'
        ? {
            ...model,
            sync: { ...model.sync, activity: 'syncing', error: null },
          }
        : model

    case 'SyncEnabled': {
      const merged = mergeSnapshots(model.vault, action.snapshot)
      const unchanged = sameSnapshot(merged, model.vault)

      return {
        ...model,
        logs: unchanged ? model.logs : logsFromSnapshot(merged),
        isPredicting: unchanged ? model.isPredicting : merged.isPredicting,
        vault: unchanged ? model.vault : merged,
        sync: {
          status: 'ready',
          username: action.username,
          activity: 'synced',
          error: null,
        },
      }
    }

    case 'SyncSucceeded': {
      if (model.sync.status !== 'ready') {
        return model
      }

      const merged = mergeSnapshots(model.vault, action.snapshot)
      const unchanged = sameSnapshot(merged, model.vault)

      return {
        ...model,
        logs: unchanged ? model.logs : logsFromSnapshot(merged),
        isPredicting: unchanged ? model.isPredicting : merged.isPredicting,
        vault: unchanged ? model.vault : merged,
        sync: {
          status: 'ready',
          username: action.username,
          activity: 'synced',
          error: null,
        },
      }
    }

    case 'SyncFailed':
      return model.sync.status === 'ready'
        ? {
            ...model,
            sync: {
              ...model.sync,
              activity: 'error',
              error: action.message,
            },
          }
        : model

    case 'SyncDisabled':
      return { ...model, sync: { status: 'off' } }
  }
}

/** Boot reads storage and the clock once. The atom is the single source of
 *  truth from then on; `RegistryProvider` can seed it in tests. */
export const modelAtom = Atom.make(initModel())

export const periodsAtom = Atom.map(modelAtom, model => periodsFrom(model.logs))

/** Every action goes through the pure reducer here, and a changed log is
 *  written once before the new model lands. */
export const dispatchAtom = Atom.writable<void, Action>(
  () => undefined,
  (ctx, action) => {
    const current = ctx.get(modelAtom)
    const next = reducer(current, action)

    if (next.logs !== current.logs) {
      saveLogs(next.logs)
    }

    if (next.isPredicting !== current.isPredicting) {
      savePredicting(next.isPredicting)
    }

    if (next.vault !== current.vault) {
      saveVault(next.vault)
    }

    if (action.type === 'SyncDisabled') {
      clearSyncCredentials()
    }

    ctx.set(modelAtom, next)
  },
)
