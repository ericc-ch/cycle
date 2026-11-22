import { Effect, Schema } from 'effect'
import { describe, expect, test } from 'vitest'

import { parsePlainDate } from '@cycle/domain'

import {
  PutVaultRequestSchema,
  applyLogsDiff,
  decryptSnapshot,
  deriveCredentials,
  emptySnapshot,
  encryptSnapshot,
  logsFromSnapshot,
  mergeSnapshots,
  nextTimestamp,
  sha256Hex,
  snapshotFromLogs,
  syncVault,
} from './index'

const date = (value: string) => {
  const parsed = parsePlainDate(value)

  if (parsed === null) {
    throw new Error(`Invalid date: ${value}`)
  }

  return parsed
}

describe('snapshot LWW merge', () => {
  test('merges non-overlapping edits and tombstones per day', () => {
    const base = snapshotFromLogs(
      [
        { date: date('2026-11-10'), flow: 'Bleeding' },
        { date: date('2026-11-11'), flow: 'Bleeding' },
      ],
      100,
    )

    const phoneA = applyLogsDiff(
      base,
      [
        { date: date('2026-11-10'), flow: 'Bleeding' },
        { date: date('2026-11-11'), flow: 'Bleeding' },
        { date: date('2026-11-12'), flow: 'Bleeding' },
      ],
      101,
    )

    const phoneB = applyLogsDiff(
      base,
      [{ date: date('2026-11-11'), flow: 'Bleeding' }],
      102,
    )

    const merged = mergeSnapshots(phoneA, phoneB)
    const mergedReverse = mergeSnapshots(phoneB, phoneA)

    expect(merged).toEqual(mergedReverse)
    expect(
      logsFromSnapshot(merged).map(log => `${log.date.toString()}:${log.flow}`),
    ).toEqual(['2026-11-11:Bleeding', '2026-11-12:Bleeding'])
  })

  test('monotonic timestamp beats a skewed local clock', () => {
    const remote = snapshotFromLogs(
      [{ date: date('2026-11-10'), flow: 'Bleeding' }],
      50_000,
    )

    expect(nextTimestamp(remote, 1000)).toBe(50_001)

    const cleared = applyLogsDiff(remote, [], 1000)

    expect(logsFromSnapshot(mergeSnapshots(remote, cleared))).toEqual([])
  })
})

describe('crypto', () => {
  test('derives deterministic separate keys and encrypts/decrypts', async () => {
    const creds = await Effect.runPromise(
      deriveCredentials('  Alice ', 'correct-horse-battery', 10_000),
    )
    const same = await Effect.runPromise(
      deriveCredentials('alice', 'correct-horse-battery', 10_000),
    )

    expect(creds).toEqual(same)
    expect(creds.vaultId).not.toBe(creds.authToken)
    expect(creds.authToken).not.toBe(creds.encKeyBase64)

    const wrongCreds = await Effect.runPromise(
      deriveCredentials('alice', 'wrong-passphrase', 10_000),
    )

    expect(wrongCreds.vaultId).toBe(creds.vaultId)
    expect(wrongCreds.authToken).not.toBe(creds.authToken)
    expect(wrongCreds.encKeyBase64).not.toBe(creds.encKeyBase64)

    const tooShort = await Effect.runPromise(
      Effect.flip(deriveCredentials('alice', 'short', 10_000)),
    )
    expect(tooShort._tag).toBe('SyncCryptoError')

    const snapshot = snapshotFromLogs(
      [{ date: date('2026-11-12'), flow: 'Spotting' }],
      10,
    )
    const ciphertext = await Effect.runPromise(encryptSnapshot(creds, snapshot))

    expect(ciphertext.startsWith('v1:')).toBe(true)
    expect(ciphertext).not.toContain('Spotting')

    const decrypted = await Effect.runPromise(
      decryptSnapshot(creds, ciphertext),
    )

    expect(decrypted).toEqual(snapshot)

    const failed = await Effect.runPromise(
      Effect.flip(decryptSnapshot(wrongCreds, ciphertext)),
    )

    expect(failed._tag).toBe('SyncCryptoError')
  })
})

describe('syncVault', () => {
  test('pushes initial vault, skips no-op sync, and resolves 409 conflicts', async () => {
    const creds = await Effect.runPromise(
      deriveCredentials('alice', 'secret-pass', 10_000),
    )
    const expectedHash = await Effect.runPromise(sha256Hex(creds.authToken))

    let stored: {
      readonly authHash: string
      readonly version: number
      readonly ciphertext: string
    } | null = null

    let injectConflictOnce = false

    const fakeFetch: typeof fetch = async (_input, init) => {
      const auth = new Headers(init?.headers).get('authorization') ?? ''
      const token = auth.replace(/^Bearer\s+/i, '').split('.')[1] ?? ''
      const hash = await Effect.runPromise(sha256Hex(token))

      if (init?.method === 'GET') {
        if (stored === null) {
          return new Response(null, { status: 404 })
        }

        if (stored.authHash !== hash) {
          return new Response(null, { status: 401 })
        }

        return new Response(
          JSON.stringify({
            version: stored.version,
            ciphertext: stored.ciphertext,
          }),
          { status: 200 },
        )
      }

      if (init?.method === 'PUT') {
        const body = Schema.decodeSync(
          Schema.fromJsonString(PutVaultRequestSchema),
        )(String(init.body))

        if (injectConflictOnce && stored !== null) {
          injectConflictOnce = false
          const remoteConcurrent = applyLogsDiff(
            await Effect.runPromise(decryptSnapshot(creds, stored.ciphertext)),
            [
              { date: date('2026-11-10'), flow: 'Bleeding' },
              { date: date('2026-11-15'), flow: 'Spotting' },
            ],
            500,
          )
          stored = {
            authHash: expectedHash,
            version: stored.version + 1,
            ciphertext: await Effect.runPromise(
              encryptSnapshot(creds, remoteConcurrent),
            ),
          }
        }

        if (stored === null) {
          if (body.expectedVersion !== 0) {
            return new Response(null, { status: 409 })
          }

          stored = {
            authHash: hash,
            version: 1,
            ciphertext: body.ciphertext,
          }

          return new Response(JSON.stringify({ version: 1 }), { status: 200 })
        }

        if (stored.authHash !== hash) {
          return new Response(null, { status: 401 })
        }

        if (stored.version !== body.expectedVersion) {
          return new Response(
            JSON.stringify({
              version: stored.version,
              ciphertext: stored.ciphertext,
            }),
            { status: 409 },
          )
        }

        stored = {
          authHash: stored.authHash,
          version: stored.version + 1,
          ciphertext: body.ciphertext,
        }

        return new Response(JSON.stringify({ version: stored.version }), {
          status: 200,
        })
      }

      return new Response(null, { status: 405 })
    }

    const initial = snapshotFromLogs(
      [{ date: date('2026-11-10'), flow: 'Bleeding' }],
      100,
    )

    const first = await Effect.runPromise(
      syncVault({
        baseUrl: 'https://cycle.ericc.ch',
        credentials: creds,
        local: initial,
        fetchFn: fakeFetch,
      }),
    )

    expect(first.version).toBe(1)
    expect(first.pushed).toBe(true)

    const noop = await Effect.runPromise(
      syncVault({
        baseUrl: 'https://cycle.ericc.ch',
        credentials: creds,
        local: first.snapshot,
        fetchFn: fakeFetch,
      }),
    )

    expect(noop.version).toBe(1)
    expect(noop.pushed).toBe(false)
    expect(noop.snapshot).toBe(first.snapshot)

    // Wrong passphrase for same username hits 401 instead of creating a second vault.
    const wrongCreds = await Effect.runPromise(
      deriveCredentials('alice', 'wrong-passphrase', 10_000),
    )
    const authError = await Effect.runPromise(
      Effect.flip(
        syncVault({
          baseUrl: 'https://cycle.ericc.ch',
          credentials: wrongCreds,
          local: emptySnapshot(),
          fetchFn: fakeFetch,
        }),
      ),
    )
    expect(authError._tag).toBe('SyncAuthError')

    // Local edit + concurrent remote edit triggers 409 -> merge -> retry -> v3.
    injectConflictOnce = true
    const localEdited = applyLogsDiff(
      first.snapshot,
      [
        { date: date('2026-11-10'), flow: 'Bleeding' },
        { date: date('2026-11-11'), flow: 'Bleeding' },
      ],
      600,
    )

    const resolved = await Effect.runPromise(
      syncVault({
        baseUrl: 'https://cycle.ericc.ch',
        credentials: creds,
        local: localEdited,
        fetchFn: fakeFetch,
      }),
    )

    expect(resolved.version).toBe(3)
    expect(resolved.pushed).toBe(true)
    expect(
      logsFromSnapshot(resolved.snapshot).map(
        log => `${log.date.toString()}:${log.flow}`,
      ),
    ).toEqual([
      '2026-11-10:Bleeding',
      '2026-11-11:Bleeding',
      '2026-11-15:Spotting',
    ])
  })
})
