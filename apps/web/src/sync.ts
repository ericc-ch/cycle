import { Effect, Option, Schema } from 'effect'

import {
  type SyncCredentials,
  SyncCredentialsSchema,
  type VaultSnapshot,
  deriveCredentials,
  syncVault,
} from '@cycle/sync'

const SYNC_CREDENTIALS_KEY = 'cycle.sync'

export const loadSyncCredentials = (): SyncCredentials | null => {
  try {
    const raw = localStorage.getItem(SYNC_CREDENTIALS_KEY)

    if (raw === null) {
      return null
    }

    return Option.getOrNull(
      Schema.decodeOption(Schema.fromJsonString(SyncCredentialsSchema))(raw),
    )
  } catch {
    return null
  }
}

export const saveSyncCredentials = (credentials: SyncCredentials): void => {
  try {
    localStorage.setItem(SYNC_CREDENTIALS_KEY, JSON.stringify(credentials))
  } catch {}
}

export const clearSyncCredentials = (): void => {
  try {
    localStorage.removeItem(SYNC_CREDENTIALS_KEY)
  } catch {}
}

export type SyncOutcome =
  | { readonly ok: true; readonly snapshot: VaultSnapshot }
  | {
      readonly ok: false
      readonly message: string
      readonly retryable: boolean
      readonly silent: boolean
    }

export const enableSync = async (
  username: string,
  passphrase: string,
  local: VaultSnapshot,
): Promise<
  | {
      readonly ok: true
      readonly credentials: SyncCredentials
      readonly snapshot: VaultSnapshot
    }
  | { readonly ok: false; readonly message: string }
> => {
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const credentials = yield* deriveCredentials(username, passphrase)
      const synced = yield* syncVault({
        baseUrl: '',
        credentials,
        local,
      })

      return { ok: true as const, credentials, snapshot: synced.snapshot }
    }).pipe(
      Effect.catch(error =>
        Effect.succeed({
          ok: false as const,
          message: error.message,
          retryable:
            error._tag === 'SyncNetworkError' ||
            error._tag === 'SyncConflictError',
          silent: error._tag === 'SyncConflictError',
        }),
      ),
    ),
  )

  if (result.ok) {
    saveSyncCredentials(result.credentials)
  }

  return result
}

export const runSync = async (
  credentials: SyncCredentials,
  local: VaultSnapshot,
): Promise<SyncOutcome> =>
  Effect.runPromise(
    syncVault({
      baseUrl: '',
      credentials,
      local,
    }).pipe(
      Effect.map(res => ({ ok: true as const, snapshot: res.snapshot })),
      Effect.catch(error =>
        Effect.succeed({
          ok: false as const,
          message: error.message,
          retryable:
            error._tag === 'SyncNetworkError' ||
            error._tag === 'SyncConflictError',
          silent: error._tag === 'SyncConflictError',
        }),
      ),
    ),
  )
