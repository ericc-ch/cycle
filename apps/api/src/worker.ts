import { Data, Effect, Option, Schema } from 'effect'

import { PutVaultRequestSchema, sha256Hex } from '@cycle/sync'

import {
  type VapidConfig,
  isAllowedPushEndpoint,
  sendEmptyWebPush,
} from './push.ts'

class SyncStorageError extends Data.TaggedError('SyncStorageError')<{
  readonly cause: unknown
}> {}

const MAX_BODY_BYTES = 256 * 1024
const MAX_PUSH_BODY_BYTES = 4 * 1024
const VAULT_ID_RE = /^[0-9a-f]{32}$/
const PutVaultRequestJson = Schema.fromJsonString(PutVaultRequestSchema)

const PutPushSubscriptionSchema = Schema.Struct({
  endpoint: Schema.String,
  notifyAt: Schema.NullOr(Schema.Number),
})

const PutPushSubscriptionJson = Schema.fromJsonString(PutPushSubscriptionSchema)

export type VaultRow = {
  readonly vault_id: string
  readonly auth_hash: string
  readonly version: number
  readonly ciphertext: string
}

export type PushSubscriptionRow = {
  readonly device_id: string
  readonly endpoint: string
  readonly notify_at: number | null
  readonly sent_for: number | null
}

export type D1RunMeta = {
  readonly changes?: number
}

export type D1PreparedStatementLike = {
  readonly bind: (...values: ReadonlyArray<unknown>) => D1PreparedStatementLike
  readonly first: () => Promise<VaultRow | null>
  readonly all?: () => Promise<{
    readonly results: ReadonlyArray<PushSubscriptionRow>
  }>
  readonly run: () => Promise<{ readonly meta: D1RunMeta }>
}

export type D1DatabaseLike = {
  readonly prepare: (query: string) => D1PreparedStatementLike
}

export type RateLimitBinding = {
  readonly limit: (options: {
    readonly key: string
  }) => Promise<{ readonly success: boolean }>
}

export type ApiEnv = {
  readonly DB: D1DatabaseLike
  readonly RATE_LIMIT_SYNC?: RateLimitBinding
  readonly VAPID_PUBLIC_KEY?: string
  readonly VAPID_PRIVATE_KEY?: string
  readonly VAPID_SUBJECT?: string
}

const json = (body: unknown, status: number): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })

const timingSafeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) {
    return false
  }

  let diff = 0

  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }

  return diff === 0
}

const parseBearer = (
  header: string | null,
): { readonly vaultId: string; readonly authToken: string } | null => {
  if (header === null) {
    return null
  }

  const match = /^Bearer\s+([^\s]+)$/i.exec(header.trim())

  if (match?.[1] === undefined) {
    return null
  }

  const raw = match[1]
  const dot = raw.indexOf('.')

  if (dot <= 0 || dot === raw.length - 1) {
    return null
  }

  const vaultId = raw.slice(0, dot)
  const authToken = raw.slice(dot + 1)

  if (!VAULT_ID_RE.test(vaultId) || authToken.length < 16) {
    return null
  }

  return { vaultId, authToken }
}

const getVaultRow = Effect.fn('getVaultRow')(function* (
  db: D1DatabaseLike,
  vaultId: string,
) {
  return yield* Effect.tryPromise({
    try: () =>
      db
        .prepare(
          'SELECT vault_id, auth_hash, version, ciphertext FROM vaults WHERE vault_id = ?',
        )
        .bind(vaultId)
        .first(),
    catch: cause => new SyncStorageError({ cause }),
  })
})

const parseDeviceToken = (header: string | null): string | null => {
  if (header === null) {
    return null
  }

  const match = /^Bearer\s+([^\s]+)$/i.exec(header.trim())
  const token = match?.[1]

  if (token === undefined || token.length < 32 || token.length > 256) {
    return null
  }

  return token
}

const checkRateLimit = Effect.fn('checkRateLimit')(function* (
  request: Request,
  env: ApiEnv,
) {
  if (env.RATE_LIMIT_SYNC === undefined) {
    return true
  }

  const ip =
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-forwarded-for') ??
    'unknown'
  const limited = yield* Effect.tryPromise({
    try: () => env.RATE_LIMIT_SYNC!.limit({ key: ip }),
    catch: () => ({ success: true }),
  })

  return limited.success
})

const handlePushRequest = Effect.fn('handlePushRequest')(function* (
  request: Request,
  env: ApiEnv,
  now: () => number,
) {
  const url = new URL(request.url)

  if (url.pathname === '/api/push/vapid-public-key') {
    if (request.method !== 'GET') {
      return json({ error: 'Method not allowed' }, 405)
    }

    if (
      env.VAPID_PUBLIC_KEY === undefined ||
      env.VAPID_PUBLIC_KEY.length === 0
    ) {
      return json({ error: 'Push notifications are not configured' }, 503)
    }

    return json({ publicKey: env.VAPID_PUBLIC_KEY }, 200)
  }

  if (url.pathname !== '/api/push/subscription') {
    return json({ error: 'Not found' }, 404)
  }

  if (request.method !== 'PUT' && request.method !== 'DELETE') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const allowed = yield* checkRateLimit(request, env)

  if (!allowed) {
    return json({ error: 'Too many requests' }, 429)
  }

  const deviceToken = parseDeviceToken(request.headers.get('authorization'))

  if (deviceToken === null) {
    return json({ error: 'Unauthorized' }, 401)
  }

  const deviceId = yield* sha256Hex(deviceToken)

  if (request.method === 'DELETE') {
    yield* Effect.tryPromise({
      try: () =>
        env.DB.prepare('DELETE FROM push_subscriptions WHERE device_id = ?')
          .bind(deviceId)
          .run(),
      catch: cause => new SyncStorageError({ cause }),
    })

    return json({ deleted: true }, 200)
  }

  const declaredLength = Number(request.headers.get('content-length') ?? '0')

  if (Number.isFinite(declaredLength) && declaredLength > MAX_PUSH_BODY_BYTES) {
    return json({ error: 'Payload too large' }, 413)
  }

  const rawText = yield* Effect.tryPromise({
    try: () => request.text(),
    catch: cause => new SyncStorageError({ cause }),
  })

  if (new TextEncoder().encode(rawText).byteLength > MAX_PUSH_BODY_BYTES) {
    return json({ error: 'Payload too large' }, 413)
  }

  const decoded = Schema.decodeOption(PutPushSubscriptionJson)(rawText)

  if (Option.isNone(decoded)) {
    return json({ error: 'Invalid request body' }, 400)
  }

  const { endpoint, notifyAt } = decoded.value

  if (!isAllowedPushEndpoint(endpoint)) {
    return json({ error: 'Unsupported push endpoint' }, 400)
  }

  if (
    notifyAt !== null &&
    (!Number.isInteger(notifyAt) || notifyAt <= 0)
  ) {
    return json({ error: 'Invalid reminder timestamp' }, 400)
  }

  const timestamp = now()

  yield* Effect.tryPromise({
    try: () =>
      env.DB.prepare(
        'INSERT INTO push_subscriptions (device_id, endpoint, notify_at, sent_for, updated_at) VALUES (?, ?, ?, NULL, ?) ON CONFLICT(device_id) DO UPDATE SET endpoint = excluded.endpoint, notify_at = excluded.notify_at, updated_at = excluded.updated_at',
      )
        .bind(deviceId, endpoint, notifyAt, timestamp)
        .run(),
    catch: cause => new SyncStorageError({ cause }),
  })

  return json({ ok: true }, 200)
})

const runScheduledReminders = Effect.fn('runScheduledReminders')(function* (
  env: ApiEnv,
  now: () => number,
  fetchFn: typeof fetch,
) {
  if (
    env.VAPID_PUBLIC_KEY === undefined ||
    env.VAPID_PUBLIC_KEY.length === 0 ||
    env.VAPID_PRIVATE_KEY === undefined ||
    env.VAPID_PRIVATE_KEY.length === 0
  ) {
    return { checked: 0, sent: 0, deleted: 0 }
  }

  const vapid: VapidConfig = {
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
    subject: env.VAPID_SUBJECT ?? 'https://cycle.ericc.ch',
  }

  const currentMs = now()
  const statement = env.DB.prepare(
    'SELECT device_id, endpoint, notify_at, sent_for FROM push_subscriptions WHERE notify_at IS NOT NULL AND notify_at <= ? AND (sent_for IS NULL OR sent_for != notify_at) LIMIT 100',
  ).bind(currentMs)

  if (statement.all === undefined) {
    return { checked: 0, sent: 0, deleted: 0 }
  }

  const { results } = yield* Effect.tryPromise({
    try: () => statement.all!(),
    catch: cause => new SyncStorageError({ cause }),
  })

  let sent = 0
  let deleted = 0

  for (const row of results) {
    if (row.notify_at === null || !isAllowedPushEndpoint(row.endpoint)) {
      continue
    }

    const outcome = yield* sendEmptyWebPush(
      row.endpoint,
      vapid,
      currentMs,
      fetchFn,
    ).pipe(Effect.catch(() => Effect.succeed({ kind: 'retry' as const, status: 0 })))

    if (outcome.kind === 'sent') {
      sent++
      yield* Effect.tryPromise({
        try: () =>
          env.DB.prepare(
            'UPDATE push_subscriptions SET sent_for = ?, notify_at = NULL, updated_at = ? WHERE device_id = ? AND notify_at = ?',
          )
            .bind(row.notify_at, now(), row.device_id, row.notify_at)
            .run(),
        catch: cause => new SyncStorageError({ cause }),
      })
    } else if (outcome.kind === 'gone') {
      deleted++
      yield* Effect.tryPromise({
        try: () =>
          env.DB.prepare('DELETE FROM push_subscriptions WHERE device_id = ?')
            .bind(row.device_id)
            .run(),
        catch: cause => new SyncStorageError({ cause }),
      })
    }
  }

  return { checked: results.length, sent, deleted }
})

const handleSyncRequest = Effect.fn('handleSyncRequest')(function* (
  request: Request,
  env: ApiEnv,
  now: () => number,
) {
  const url = new URL(request.url)

  if (url.pathname === '/api/health' && request.method === 'GET') {
    return json({ ok: true }, 200)
  }

  if (url.pathname.startsWith('/api/push/')) {
    return yield* handlePushRequest(request, env, now)
  }

  if (url.pathname !== '/api/sync') {
    return json({ error: 'Not found' }, 404)
  }

  if (
    request.method !== 'GET' &&
    request.method !== 'PUT' &&
    request.method !== 'DELETE'
  ) {
    return json({ error: 'Method not allowed' }, 405)
  }

  const allowed = yield* checkRateLimit(request, env)

  if (!allowed) {
    return json({ error: 'Too many requests' }, 429)
  }

  const bearer = parseBearer(request.headers.get('authorization'))

  if (bearer === null) {
    return json({ error: 'Unauthorized' }, 401)
  }

  const authHash = yield* sha256Hex(bearer.authToken)

  if (request.method === 'GET') {
    const row = yield* getVaultRow(env.DB, bearer.vaultId)

    if (row === null) {
      return json({ error: 'Not found' }, 404)
    }

    if (!timingSafeEqual(row.auth_hash, authHash)) {
      return json({ error: 'Unauthorized' }, 401)
    }

    return json({ version: row.version, ciphertext: row.ciphertext }, 200)
  }

  if (request.method === 'DELETE') {
    const existing = yield* getVaultRow(env.DB, bearer.vaultId)

    if (existing === null) {
      return json({ error: 'Not found' }, 404)
    }

    if (!timingSafeEqual(existing.auth_hash, authHash)) {
      return json({ error: 'Unauthorized' }, 401)
    }

    yield* Effect.tryPromise({
      try: () =>
        env.DB.prepare(
          'DELETE FROM vaults WHERE vault_id = ? AND auth_hash = ?',
        )
          .bind(bearer.vaultId, authHash)
          .run(),
      catch: cause => new SyncStorageError({ cause }),
    })

    return json({ deleted: true }, 200)
  }

  // Reject unauthenticated writes against an existing vault before buffering body.
  const preExisting = yield* getVaultRow(env.DB, bearer.vaultId)

  if (
    preExisting !== null &&
    !timingSafeEqual(preExisting.auth_hash, authHash)
  ) {
    return json({ error: 'Unauthorized' }, 401)
  }

  const declaredLength = Number(request.headers.get('content-length') ?? '0')

  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return json({ error: 'Payload too large' }, 413)
  }

  const rawText = yield* Effect.tryPromise({
    try: () => request.text(),
    catch: cause => new SyncStorageError({ cause }),
  })

  if (new TextEncoder().encode(rawText).byteLength > MAX_BODY_BYTES) {
    return json({ error: 'Payload too large' }, 413)
  }

  const decoded = Schema.decodeOption(PutVaultRequestJson)(rawText)

  if (Option.isNone(decoded)) {
    return json({ error: 'Invalid request body' }, 400)
  }

  const { expectedVersion, ciphertext } = decoded.value

  if (
    !Number.isInteger(expectedVersion) ||
    expectedVersion < 0 ||
    !ciphertext.startsWith('v1:')
  ) {
    return json({ error: 'Invalid version or ciphertext' }, 400)
  }

  const timestamp = now()

  if (expectedVersion === 0) {
    const insertResult = yield* Effect.tryPromise({
      try: () =>
        env.DB.prepare(
          'INSERT INTO vaults (vault_id, auth_hash, version, ciphertext, updated_at) VALUES (?, ?, 1, ?, ?) ON CONFLICT(vault_id) DO NOTHING',
        )
          .bind(bearer.vaultId, authHash, ciphertext, timestamp)
          .run(),
      catch: cause => new SyncStorageError({ cause }),
    })

    if ((insertResult.meta.changes ?? 0) === 1) {
      return json({ version: 1 }, 200)
    }

    const existing = yield* getVaultRow(env.DB, bearer.vaultId)

    if (existing === null || !timingSafeEqual(existing.auth_hash, authHash)) {
      return json({ error: 'Unauthorized' }, 401)
    }

    return json(
      { version: existing.version, ciphertext: existing.ciphertext },
      409,
    )
  }

  const updateResult = yield* Effect.tryPromise({
    try: () =>
      env.DB.prepare(
        'UPDATE vaults SET version = version + 1, ciphertext = ?, updated_at = ? WHERE vault_id = ? AND auth_hash = ? AND version = ?',
      )
        .bind(ciphertext, timestamp, bearer.vaultId, authHash, expectedVersion)
        .run(),
    catch: cause => new SyncStorageError({ cause }),
  })

  if ((updateResult.meta.changes ?? 0) === 1) {
    return json({ version: expectedVersion + 1 }, 200)
  }

  const existing = yield* getVaultRow(env.DB, bearer.vaultId)

  if (existing === null || !timingSafeEqual(existing.auth_hash, authHash)) {
    return json({ error: 'Unauthorized' }, 401)
  }

  return json(
    { version: existing.version, ciphertext: existing.ciphertext },
    409,
  )
})

export const createSyncWorker = (
  now: () => number = () => Date.now(),
  fetchFn: typeof fetch = globalThis.fetch,
) => ({
  fetch: async (request: Request, env: ApiEnv): Promise<Response> => {
    const startedAt = now()
    const url = new URL(request.url)

    const response = await Effect.runPromise(
      handleSyncRequest(request, env, now).pipe(
        Effect.catchCause(() =>
          Effect.succeed(json({ error: 'Internal error' }, 500)),
        ),
      ),
    )

    console.log(
      JSON.stringify({
        event: 'sync.request',
        method: request.method,
        path: url.pathname,
        status: response.status,
        outcome: response.status >= 400 ? 'error' : 'success',
        durationMs: now() - startedAt,
      }),
    )

    return response
  },
  scheduled: async (_controller: unknown, env: ApiEnv): Promise<void> => {
    const startedAt = now()
    const stats = await Effect.runPromise(
      runScheduledReminders(env, now, fetchFn).pipe(
        Effect.catchCause(() =>
          Effect.succeed({ checked: 0, sent: 0, deleted: 0 }),
        ),
      ),
    )

    console.log(
      JSON.stringify({
        event: 'push.scheduled',
        ...stats,
        durationMs: now() - startedAt,
      }),
    )
  },
})

export default createSyncWorker()
