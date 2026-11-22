import { Effect } from 'effect'
import { Base64Url } from 'effect/encoding'
import { describe, expect, test } from 'vitest'

import {
  deriveCredentials,
  emptySnapshot,
  encryptSnapshot,
  syncVault,
} from '@cycle/sync'

import { isAllowedPushEndpoint } from './push'
import {
  type ApiEnv,
  type D1DatabaseLike,
  type D1PreparedStatementLike,
  type PushSubscriptionRow,
  createSyncWorker,
} from './worker'

type Row = {
  vault_id: string
  auth_hash: string
  version: number
  ciphertext: string
  updated_at: number
}

type StoredPushRow = {
  device_id: string
  endpoint: string
  notify_at: number | null
  sent_for: number | null
  updated_at: number
}

const makeFakeD1 = (): D1DatabaseLike => {
  const rows = new Map<string, Row>()
  const pushRows = new Map<string, StoredPushRow>()

  const makeStatement = (
    query: string,
    params: ReadonlyArray<unknown> = [],
  ): D1PreparedStatementLike => ({
    bind: (...values) => makeStatement(query, values),
    first: async () => {
      if (query.startsWith('SELECT') && query.includes('FROM vaults')) {
        const vaultId = String(params[0])
        return rows.get(vaultId) ?? null
      }

      return null
    },
    all: async () => {
      if (query.includes('FROM push_subscriptions')) {
        const currentMs = Number(params[0])
        const results: PushSubscriptionRow[] = []

        for (const row of pushRows.values()) {
          if (
            row.notify_at !== null &&
            row.notify_at <= currentMs &&
            (row.sent_for === null || row.sent_for !== row.notify_at)
          ) {
            results.push({
              device_id: row.device_id,
              endpoint: row.endpoint,
              notify_at: row.notify_at,
              sent_for: row.sent_for,
            })
          }
        }

        return { results }
      }

      return { results: [] }
    },
    run: async () => {
      if (query.startsWith('INSERT INTO vaults')) {
        const vault_id = String(params[0])
        const auth_hash = String(params[1])
        const ciphertext = String(params[2])
        const updated_at = Number(params[3])

        if (rows.has(vault_id)) {
          return { meta: { changes: 0 } }
        }

        rows.set(vault_id, {
          vault_id,
          auth_hash,
          version: 1,
          ciphertext,
          updated_at,
        })

        return { meta: { changes: 1 } }
      }

      if (query.startsWith('UPDATE vaults')) {
        const ciphertext = String(params[0])
        const updated_at = Number(params[1])
        const vault_id = String(params[2])
        const auth_hash = String(params[3])
        const expectedVersion = Number(params[4])
        const existing = rows.get(vault_id)

        if (
          existing === undefined ||
          existing.auth_hash !== auth_hash ||
          existing.version !== expectedVersion
        ) {
          return { meta: { changes: 0 } }
        }

        rows.set(vault_id, {
          ...existing,
          version: existing.version + 1,
          ciphertext,
          updated_at,
        })

        return { meta: { changes: 1 } }
      }

      if (query.startsWith('INSERT INTO push_subscriptions')) {
        const device_id = String(params[0])
        const endpoint = String(params[1])
        const notify_at = params[2] === null ? null : Number(params[2])
        const updated_at = Number(params[3])
        const existing = pushRows.get(device_id)

        pushRows.set(device_id, {
          device_id,
          endpoint,
          notify_at,
          sent_for: existing?.sent_for ?? null,
          updated_at,
        })

        return { meta: { changes: 1 } }
      }

      if (query.startsWith('UPDATE push_subscriptions')) {
        const sent_for = Number(params[0])
        const updated_at = Number(params[1])
        const device_id = String(params[2])
        const expectedNotifyAt = Number(params[3])
        const existing = pushRows.get(device_id)

        if (existing === undefined || existing.notify_at !== expectedNotifyAt) {
          return { meta: { changes: 0 } }
        }

        pushRows.set(device_id, {
          ...existing,
          sent_for,
          notify_at: null,
          updated_at,
        })

        return { meta: { changes: 1 } }
      }

      if (query.startsWith('DELETE FROM push_subscriptions')) {
        const device_id = String(params[0])
        const existed = pushRows.delete(device_id)

        return { meta: { changes: existed ? 1 : 0 } }
      }

      return { meta: { changes: 0 } }
    },
  })

  return {
    prepare: query => makeStatement(query),
  }
}

const makeTestVapidKeys = async () => {
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  )
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey)
  const rawPub = new Uint8Array(
    await crypto.subtle.exportKey('raw', pair.publicKey),
  )

  return {
    publicKey: Base64Url.encode(rawPub),
    privateKey: jwk.d ?? '',
  }
}

describe('sync worker', () => {
  test('creates vault, enforces auth, and handles CAS conflicts', async () => {
    const worker = createSyncWorker(() => 1000)
    const env: ApiEnv = { DB: makeFakeD1() }
    const creds = await Effect.runPromise(
      deriveCredentials('alice', 'my-passphrase', 10_000),
    )
    const wrongCreds = await Effect.runPromise(
      deriveCredentials('alice', 'other-passphrase', 10_000),
    )
    const auth = `Bearer ${creds.vaultId}.${creds.authToken}`
    const wrongAuth = `Bearer ${creds.vaultId}.${wrongCreds.authToken}`

    // Initial GET -> 404
    const missing = await worker.fetch(
      new Request('https://cycle.ericc.ch/api/sync', {
        headers: { authorization: auth },
      }),
      env,
    )
    expect(missing.status).toBe(404)

    // Initial PUT -> 200 v1
    const ct1 = await Effect.runPromise(
      encryptSnapshot(creds, emptySnapshot()),
    )
    const created = await worker.fetch(
      new Request('https://cycle.ericc.ch/api/sync', {
        method: 'PUT',
        headers: { authorization: auth, 'content-type': 'application/json' },
        body: JSON.stringify({ expectedVersion: 0, ciphertext: ct1 }),
      }),
      env,
    )
    expect(created.status).toBe(200)
    expect(await created.json()).toEqual({ version: 1 })

    // Wrong token -> 401
    const denied = await worker.fetch(
      new Request('https://cycle.ericc.ch/api/sync', {
        headers: { authorization: wrongAuth },
      }),
      env,
    )
    expect(denied.status).toBe(401)

    // Stale expectedVersion -> 409 with latest ciphertext
    const ct2 = await Effect.runPromise(
      encryptSnapshot(creds, emptySnapshot()),
    )
    const conflict = await worker.fetch(
      new Request('https://cycle.ericc.ch/api/sync', {
        method: 'PUT',
        headers: { authorization: auth, 'content-type': 'application/json' },
        body: JSON.stringify({ expectedVersion: 0, ciphertext: ct2 }),
      }),
      env,
    )
    expect(conflict.status).toBe(409)
    expect(await conflict.json()).toEqual({ version: 1, ciphertext: ct1 })

    // End-to-end with syncVault client
    const synced = await Effect.runPromise(
      syncVault({
        baseUrl: 'https://cycle.ericc.ch',
        credentials: creds,
        local: emptySnapshot(),
        fetchFn: (input, init) => worker.fetch(new Request(input, init), env),
      }),
    )
    expect(synced.version).toBe(1)
  })

  test('rejects payloads over 256 KB with 413', async () => {
    const worker = createSyncWorker(() => 1000)
    const env: ApiEnv = { DB: makeFakeD1() }
    const creds = await Effect.runPromise(
      deriveCredentials('alice', 'my-passphrase', 10_000),
    )

    const tooBig = await worker.fetch(
      new Request('https://cycle.ericc.ch/api/sync', {
        method: 'PUT',
        headers: {
          authorization: `Bearer ${creds.vaultId}.${creds.authToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          expectedVersion: 0,
          ciphertext: `v1:${'a'.repeat(270_000)}`,
        }),
      }),
      env,
    )
    expect(tooBig.status).toBe(413)
  })
})

describe('push reminders worker', () => {
  test('validates push endpoint allowlist against SSRF', () => {
    expect(
      isAllowedPushEndpoint('https://web.push.apple.com/Q3x9-test'),
    ).toBe(true)
    expect(
      isAllowedPushEndpoint('https://fcm.googleapis.com/fcm/send/abc123'),
    ).toBe(true)
    expect(
      isAllowedPushEndpoint(
        'https://updates.push.services.mozilla.com/wpush/v2/abc',
      ),
    ).toBe(true)
    expect(isAllowedPushEndpoint('http://fcm.googleapis.com/fcm/send/a')).toBe(
      false,
    )
    expect(
      isAllowedPushEndpoint('https://fcm.googleapis.com:8443/fcm/send/a'),
    ).toBe(false)
    expect(isAllowedPushEndpoint('https://169.254.169.254/latest')).toBe(false)
    expect(isAllowedPushEndpoint('https://evil.example.com/push')).toBe(false)
  })

  test('subscribes, rejects invalid endpoints, sends due pushes, and cleans up 410', async () => {
    const vapid = await makeTestVapidKeys()
    let nowMs = 1_700_000_000_000
    const deliveries: Array<{ readonly url: string; readonly auth: string }> = []
    let nextPushStatus = 201

    const fakePushFetch: typeof fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString()
      const auth = new Headers(init?.headers).get('authorization') ?? ''
      deliveries.push({ url, auth })

      return new Response(null, { status: nextPushStatus })
    }

    const worker = createSyncWorker(() => nowMs, fakePushFetch)
    const env: ApiEnv = {
      DB: makeFakeD1(),
      VAPID_PUBLIC_KEY: vapid.publicKey,
      VAPID_PRIVATE_KEY: vapid.privateKey,
      VAPID_SUBJECT: 'https://cycle.ericc.ch',
    }

    // Public key route returns configured VAPID key
    const keyRes = await worker.fetch(
      new Request('https://cycle.ericc.ch/api/push/vapid-public-key'),
      env,
    )
    expect(keyRes.status).toBe(200)
    expect(await keyRes.json()).toEqual({ publicKey: vapid.publicKey })

    const tokenA = 'a'.repeat(40)
    const tokenB = 'b'.repeat(40)

    // Rejects non-allowlisted endpoint (SSRF protection)
    const badEndpoint = await worker.fetch(
      new Request('https://cycle.ericc.ch/api/push/subscription', {
        method: 'PUT',
        headers: {
          authorization: `Bearer ${tokenA}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          endpoint: 'https://internal.example.com/hook',
          notifyAt: nowMs - 1000,
        }),
      }),
      env,
    )
    expect(badEndpoint.status).toBe(400)

    // Registers two due subscriptions
    const subA = await worker.fetch(
      new Request('https://cycle.ericc.ch/api/push/subscription', {
        method: 'PUT',
        headers: {
          authorization: `Bearer ${tokenA}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          endpoint: 'https://web.push.apple.com/device-a',
          notifyAt: nowMs - 1000,
        }),
      }),
      env,
    )
    expect(subA.status).toBe(200)

    // Run cron: delivers VAPID-signed push once and clears notify_at
    await worker.scheduled({}, env)
    expect(deliveries).toHaveLength(1)
    expect(deliveries[0]?.url).toBe('https://web.push.apple.com/device-a')
    expect(deliveries[0]?.auth.startsWith('vapid t=')).toBe(true)
    expect(deliveries[0]?.auth).toContain(`, k=${vapid.publicKey}`)

    // Running cron again does not duplicate delivery
    await worker.scheduled({}, env)
    expect(deliveries).toHaveLength(1)

    // Subscription B returns 410 Gone -> deleted automatically
    nextPushStatus = 410
    await worker.fetch(
      new Request('https://cycle.ericc.ch/api/push/subscription', {
        method: 'PUT',
        headers: {
          authorization: `Bearer ${tokenB}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          endpoint: 'https://fcm.googleapis.com/fcm/send/device-b',
          notifyAt: nowMs - 500,
        }),
      }),
      env,
    )
    await worker.scheduled({}, env)
    expect(deliveries).toHaveLength(2)

    // Subsequent cron sees nothing left to send
    nowMs += 60_000
    await worker.scheduled({}, env)
    expect(deliveries).toHaveLength(2)

    // Explicit DELETE works
    const del = await worker.fetch(
      new Request('https://cycle.ericc.ch/api/push/subscription', {
        method: 'DELETE',
        headers: { authorization: `Bearer ${tokenA}` },
      }),
      env,
    )
    expect(del.status).toBe(200)
  })
})
