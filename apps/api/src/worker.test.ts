import { Effect } from 'effect'
import { describe, expect, test } from 'vitest'

import {
  deriveCredentials,
  emptySnapshot,
  encryptSnapshot,
  syncVault,
} from '@cycle/sync'

import {
  type ApiEnv,
  type D1DatabaseLike,
  type D1PreparedStatementLike,
  createSyncWorker,
} from './worker'

type Row = {
  vault_id: string
  auth_hash: string
  version: number
  ciphertext: string
  updated_at: number
}

const makeFakeD1 = (): D1DatabaseLike => {
  const rows = new Map<string, Row>()

  const makeStatement = (
    query: string,
    params: ReadonlyArray<unknown> = [],
  ): D1PreparedStatementLike => ({
    bind: (...values) => makeStatement(query, values),
    first: async () => {
      if (query.startsWith('SELECT')) {
        const vaultId = String(params[0])
        return rows.get(vaultId) ?? null
      }

      return null
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

      return { meta: { changes: 0 } }
    },
  })

  return {
    prepare: query => makeStatement(query),
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
