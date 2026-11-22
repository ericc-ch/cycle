import { Data, Effect, Schema } from 'effect'

import {
  type SyncCredentials,
  type SyncCryptoError,
  decryptSnapshot,
  encryptSnapshot,
} from './crypto.ts'
import {
  type VaultSnapshot,
  mergeSnapshots,
  sameSnapshot,
} from './snapshot.ts'

export const GetVaultResponseSchema = Schema.Struct({
  version: Schema.Number,
  ciphertext: Schema.String,
})

export type GetVaultResponse = Schema.Schema.Type<typeof GetVaultResponseSchema>

export const PutVaultRequestSchema = Schema.Struct({
  expectedVersion: Schema.Number,
  ciphertext: Schema.String,
})

export type PutVaultRequest = Schema.Schema.Type<typeof PutVaultRequestSchema>

export const PutVaultResponseSchema = Schema.Struct({
  version: Schema.Number,
})

export type PutVaultResponse = Schema.Schema.Type<typeof PutVaultResponseSchema>

export const ConflictResponseSchema = Schema.Struct({
  version: Schema.Number,
  ciphertext: Schema.String,
})

export type ConflictResponse = Schema.Schema.Type<typeof ConflictResponseSchema>

export class SyncNetworkError extends Data.TaggedError('SyncNetworkError')<{
  readonly message: string
  readonly status?: number
  readonly cause?: unknown
}> {}

export class SyncAuthError extends Data.TaggedError('SyncAuthError')<{
  readonly message: string
}> {}

export class SyncConflictError extends Data.TaggedError('SyncConflictError')<{
  readonly message: string
}> {}

export class SyncDecodeError extends Data.TaggedError('SyncDecodeError')<{
  readonly message: string
  readonly cause?: unknown
}> {}

export type SyncError =
  | SyncCryptoError
  | SyncNetworkError
  | SyncAuthError
  | SyncConflictError
  | SyncDecodeError

export type SyncResult = {
  readonly snapshot: VaultSnapshot
  readonly version: number
  readonly pushed: boolean
}

export type SyncVaultInput = {
  readonly baseUrl: string
  readonly credentials: SyncCredentials
  readonly local: VaultSnapshot
  readonly fetchFn?: typeof fetch
  readonly maxConflictRetries?: number
  readonly retryDelayMs?: (attempt: number) => number
}

const GetVaultResponseJson = Schema.fromJsonString(GetVaultResponseSchema)
const PutVaultResponseJson = Schema.fromJsonString(PutVaultResponseSchema)
const ConflictResponseJson = Schema.fromJsonString(ConflictResponseSchema)

const SYNC_TIMEOUT_MS = 15_000
export const DEFAULT_MAX_CONFLICT_RETRIES = 5

const defaultConflictDelayMs = (attempt: number): number =>
  Math.min(1000, 50 * 2 ** attempt) + Math.floor(Math.random() * 100)

const waitMs = (ms: number): Effect.Effect<void> =>
  ms <= 0
    ? Effect.void
    : Effect.promise(
        () => new Promise<void>(resolve => globalThis.setTimeout(resolve, ms)),
      )

const authHeader = (credentials: SyncCredentials): string =>
  `Bearer ${credentials.vaultId}.${credentials.authToken}`

const syncEndpoint = (baseUrl: string): string =>
  `${baseUrl.replace(/\/+$/, '')}/api/sync`

const fetchWithTimeout = (
  fetchFn: typeof fetch,
  url: string,
  init: RequestInit,
): Promise<Response> => {
  const controller = new AbortController()
  const timer = globalThis.setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS)

  return fetchFn(url, { ...init, signal: controller.signal }).finally(() => {
    globalThis.clearTimeout(timer)
  })
}

const readText = Effect.fn('readText')(function* (response: Response) {
  return yield* Effect.tryPromise({
    try: () => response.text(),
    catch: cause =>
      new SyncDecodeError({
        message: 'Failed to read server response.',
        cause,
      }),
  })
})

const putOnce = Effect.fn('putOnce')(function* (
  url: string,
  credentials: SyncCredentials,
  expectedVersion: number,
  ciphertext: string,
  fetchFn: typeof fetch,
) {
  const response = yield* Effect.tryPromise({
    try: () =>
      fetchWithTimeout(fetchFn, url, {
        method: 'PUT',
        headers: {
          authorization: authHeader(credentials),
          'content-type': 'application/json',
        },
        body: JSON.stringify({ expectedVersion, ciphertext }),
      }),
    catch: cause =>
      new SyncNetworkError({ message: 'Unable to reach sync server.', cause }),
  })

  if (response.status === 401) {
    return yield* new SyncAuthError({
      message: 'Wrong username or passphrase.',
    })
  }

  if (response.status === 409) {
    const raw = yield* readText(response)
    const conflict = yield* Schema.decodeEffect(ConflictResponseJson)(raw).pipe(
      Effect.mapError(
        cause =>
          new SyncDecodeError({
            message: 'Invalid conflict response from server.',
            cause,
          }),
      ),
    )

    return { ok: false as const, conflict }
  }

  if (!response.ok) {
    return yield* new SyncNetworkError({
      message: `Sync failed (${response.status}).`,
      status: response.status,
    })
  }

  const raw = yield* readText(response)
  const decoded = yield* Schema.decodeEffect(PutVaultResponseJson)(raw).pipe(
    Effect.mapError(
      cause =>
        new SyncDecodeError({
          message: 'Invalid save response from server.',
          cause,
        }),
    ),
  )

  return { ok: true as const, version: decoded.version }
})

export const syncVault = Effect.fn('syncVault')(function* ({
  baseUrl,
  credentials,
  local,
  fetchFn = globalThis.fetch,
  maxConflictRetries = DEFAULT_MAX_CONFLICT_RETRIES,
  retryDelayMs = defaultConflictDelayMs,
}: SyncVaultInput): Effect.fn.Return<SyncResult, SyncError> {
  const url = syncEndpoint(baseUrl)
  const getResponse = yield* Effect.tryPromise({
    try: () =>
      fetchWithTimeout(fetchFn, url, {
        method: 'GET',
        headers: { authorization: authHeader(credentials) },
      }),
    catch: cause =>
      new SyncNetworkError({ message: 'Unable to reach sync server.', cause }),
  })

  if (getResponse.status === 401) {
    return yield* new SyncAuthError({
      message: 'Wrong username or passphrase.',
    })
  }

  let remote: VaultSnapshot | null = null
  let expectedVersion = 0

  if (getResponse.status === 200) {
    const raw = yield* readText(getResponse)
    const decoded = yield* Schema.decodeEffect(GetVaultResponseJson)(raw).pipe(
      Effect.mapError(
        cause =>
          new SyncDecodeError({
            message: 'Invalid sync response from server.',
            cause,
          }),
      ),
    )

    remote = yield* decryptSnapshot(credentials, decoded.ciphertext)
    expectedVersion = decoded.version
  } else if (getResponse.status !== 404) {
    return yield* new SyncNetworkError({
      message: `Sync failed (${getResponse.status}).`,
      status: getResponse.status,
    })
  }

  let merged = remote === null ? local : mergeSnapshots(local, remote)

  if (remote !== null && sameSnapshot(merged, remote)) {
    return { snapshot: merged, version: expectedVersion, pushed: false }
  }

  for (let attempt = 0; attempt <= maxConflictRetries; attempt++) {
    const ciphertext = yield* encryptSnapshot(credentials, merged)
    const result = yield* putOnce(
      url,
      credentials,
      expectedVersion,
      ciphertext,
      fetchFn,
    )

    if (result.ok) {
      return { snapshot: merged, version: result.version, pushed: true }
    }

    const latestRemote = yield* decryptSnapshot(
      credentials,
      result.conflict.ciphertext,
    )
    merged = mergeSnapshots(merged, latestRemote)
    expectedVersion = result.conflict.version

    if (sameSnapshot(merged, latestRemote)) {
      return {
        snapshot: merged,
        version: expectedVersion,
        pushed: false,
      }
    }

    if (attempt < maxConflictRetries) {
      yield* waitMs(retryDelayMs(attempt))
    }
  }

  return yield* new SyncConflictError({
    message: 'Vault changed on another device. Retrying automatically.',
  })
})
