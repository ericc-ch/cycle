import { Schema } from 'effect'

import {
  type DayLog,
  FlowSchema,
  formatPlainDate,
  logsSorted,
  parsePlainDate,
} from '@cycle/domain'

export const VaultEntrySchema = Schema.Struct({
  date: Schema.String,
  flow: Schema.NullOr(FlowSchema),
  updatedAt: Schema.Number,
})

export type VaultEntry = Schema.Schema.Type<typeof VaultEntrySchema>

export const VaultSnapshotSchema = Schema.Struct({
  entries: Schema.Array(VaultEntrySchema),
  isPredicting: Schema.Boolean,
  isPredictingUpdatedAt: Schema.Number,
})

export type VaultSnapshot = Schema.Schema.Type<typeof VaultSnapshotSchema>

export const emptySnapshot = (isPredicting = true): VaultSnapshot => ({
  entries: [],
  isPredicting,
  isPredictingUpdatedAt: 0,
})

const sortEntries = (
  entries: ReadonlyArray<VaultEntry>,
): ReadonlyArray<VaultEntry> =>
  [...entries].sort((a, b) => a.date.localeCompare(b.date))

export const maxUpdatedAt = (snapshot: VaultSnapshot): number => {
  let max = snapshot.isPredictingUpdatedAt

  for (const entry of snapshot.entries) {
    if (entry.updatedAt > max) {
      max = entry.updatedAt
    }
  }

  return max
}

export const nextTimestamp = (
  snapshot: VaultSnapshot,
  now = Date.now(),
): number => Math.max(now, maxUpdatedAt(snapshot) + 1)

export const snapshotFromLogs = (
  logs: ReadonlyArray<DayLog>,
  isPredicting: boolean,
  updatedAt = 1,
): VaultSnapshot => ({
  entries: sortEntries(
    logsSorted(logs).map(log => ({
      date: formatPlainDate(log.date),
      flow: log.flow,
      updatedAt,
    })),
  ),
  isPredicting,
  isPredictingUpdatedAt: updatedAt,
})

export const logsFromSnapshot = (
  snapshot: VaultSnapshot,
): ReadonlyArray<DayLog> => {
  const logs: DayLog[] = []

  for (const entry of snapshot.entries) {
    if (entry.flow === null) {
      continue
    }

    const date = parsePlainDate(entry.date)

    if (date === null) {
      continue
    }

    logs.push({ date, flow: entry.flow })
  }

  return logsSorted(logs)
}

export const applyLogsDiff = (
  base: VaultSnapshot,
  nextLogs: ReadonlyArray<DayLog>,
  now = Date.now(),
): VaultSnapshot => {
  const stamp = nextTimestamp(base, now)
  const map = new Map<string, VaultEntry>(
    base.entries.map(entry => [entry.date, entry]),
  )
  const nextByDate = new Map(
    logsSorted(nextLogs).map(log => [formatPlainDate(log.date), log.flow]),
  )

  let changed = false

  for (const [date, flow] of nextByDate) {
    const prev = map.get(date)

    if (prev === undefined || prev.flow !== flow) {
      map.set(date, { date, flow, updatedAt: stamp })
      changed = true
    }
  }

  for (const [date, prev] of map) {
    if (!nextByDate.has(date) && prev.flow !== null) {
      map.set(date, { date, flow: null, updatedAt: stamp })
      changed = true
    }
  }

  return changed ? { ...base, entries: sortEntries([...map.values()]) } : base
}

export const applyPrediction = (
  base: VaultSnapshot,
  isPredicting: boolean,
  now = Date.now(),
): VaultSnapshot =>
  base.isPredicting === isPredicting
    ? base
    : {
        ...base,
        isPredicting,
        isPredictingUpdatedAt: nextTimestamp(base, now),
      }

const flowRank = (flow: VaultEntry['flow']): number => {
  switch (flow) {
    case null:
      return 0
    case 'Spotting':
      return 1
    case 'Bleeding':
      return 2
  }
}

const pickEntry = (a: VaultEntry, b: VaultEntry): VaultEntry => {
  if (a.updatedAt !== b.updatedAt) {
    return a.updatedAt > b.updatedAt ? a : b
  }

  return flowRank(a.flow) >= flowRank(b.flow) ? a : b
}

export const mergeSnapshots = (
  local: VaultSnapshot,
  remote: VaultSnapshot,
): VaultSnapshot => {
  const map = new Map<string, VaultEntry>()

  for (const entry of local.entries) {
    map.set(entry.date, entry)
  }

  for (const entry of remote.entries) {
    const existing = map.get(entry.date)

    map.set(entry.date, existing === undefined ? entry : pickEntry(existing, entry))
  }

  const preferLocalPrediction =
    local.isPredictingUpdatedAt > remote.isPredictingUpdatedAt ||
    (local.isPredictingUpdatedAt === remote.isPredictingUpdatedAt &&
      (local.isPredicting || !remote.isPredicting))

  const merged: VaultSnapshot = {
    entries: sortEntries([...map.values()]),
    isPredicting: preferLocalPrediction
      ? local.isPredicting
      : remote.isPredicting,
    isPredictingUpdatedAt: Math.max(
      local.isPredictingUpdatedAt,
      remote.isPredictingUpdatedAt,
    ),
  }

  return sameSnapshot(merged, local) ? local : merged
}

export const sameSnapshot = (a: VaultSnapshot, b: VaultSnapshot): boolean =>
  a.isPredicting === b.isPredicting &&
  a.isPredictingUpdatedAt === b.isPredictingUpdatedAt &&
  a.entries.length === b.entries.length &&
  a.entries.every((entry, index) => {
    const other = b.entries[index]

    return (
      other !== undefined &&
      entry.date === other.date &&
      entry.flow === other.flow &&
      entry.updatedAt === other.updatedAt
    )
  })
