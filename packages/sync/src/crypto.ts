import { Data, Effect, Schema } from 'effect'
import { Base64Url, Hex } from 'effect/encoding'

import { type VaultSnapshot, VaultSnapshotSchema } from './snapshot.ts'

export class SyncCryptoError extends Data.TaggedError('SyncCryptoError')<{
  readonly message: string
  readonly cause?: unknown
}> {}

export const SyncCredentialsSchema = Schema.Struct({
  username: Schema.String,
  vaultId: Schema.String,
  authToken: Schema.String,
  encKeyBase64: Schema.String,
})

export type SyncCredentials = Schema.Schema.Type<typeof SyncCredentialsSchema>

export const DEFAULT_PBKDF2_ITERATIONS = 600_000
export const MIN_PASSPHRASE_LENGTH = 8

const VaultSnapshotJson = Schema.fromJsonString(VaultSnapshotSchema)
const encoder = new TextEncoder()
const decoder = new TextDecoder()

const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}

const decodeBase64Url = Effect.fn('decodeBase64Url')(function* (value: string) {
  return yield* Effect.fromResult(Base64Url.decode(value)).pipe(
    Effect.mapError(
      cause =>
        new SyncCryptoError({
          message: 'Malformed base64url payload.',
          cause,
        }),
    ),
  )
})

export const normalizeUsername = (username: string): string =>
  username.trim().toLowerCase()

const hkdfBytes = (
  masterKey: CryptoKey,
  info: string,
  bits: number,
): Promise<Uint8Array> =>
  globalThis.crypto.subtle
    .deriveBits(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: new Uint8Array(0),
        info: encoder.encode(info),
      },
      masterKey,
      bits,
    )
    .then(buffer => new Uint8Array(buffer))

export const deriveCredentials = Effect.fn('deriveCredentials')(function* (
  username: string,
  passphrase: string,
  iterations = DEFAULT_PBKDF2_ITERATIONS,
) {
  const normalized = normalizeUsername(username)

  if (normalized.length === 0) {
    return yield* new SyncCryptoError({
      message: 'Username is required.',
    })
  }

  if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
    return yield* new SyncCryptoError({
      message: `Passphrase must be at least ${MIN_PASSPHRASE_LENGTH} characters.`,
    })
  }

  return yield* Effect.tryPromise({
    try: async (): Promise<SyncCredentials> => {
      const subtle = globalThis.crypto.subtle
      const vaultIdDigest = await subtle.digest(
        'SHA-256',
        encoder.encode(`cycle:vault-id:v1:${normalized}`),
      )
      const vaultId = Hex.encode(new Uint8Array(vaultIdDigest).slice(0, 16))
      const baseKey = await subtle.importKey(
        'raw',
        encoder.encode(passphrase),
        'PBKDF2',
        false,
        ['deriveBits'],
      )
      const masterBits = await subtle.deriveBits(
        {
          name: 'PBKDF2',
          hash: 'SHA-256',
          salt: encoder.encode(`cycle:kdf:v1:${normalized}`),
          iterations,
        },
        baseKey,
        256,
      )
      const masterKey = await subtle.importKey(
        'raw',
        masterBits,
        'HKDF',
        false,
        ['deriveBits'],
      )
      const [authTokenBytes, encKeyBytes] = await Promise.all([
        hkdfBytes(masterKey, 'cycle:auth-token:v1', 256),
        hkdfBytes(masterKey, 'cycle:enc-key:v1', 256),
      ])

      return {
        username: normalized,
        vaultId,
        authToken: Base64Url.encode(authTokenBytes),
        encKeyBase64: Base64Url.encode(encKeyBytes),
      }
    },
    catch: cause =>
      new SyncCryptoError({ message: 'Failed to derive sync keys.', cause }),
  })
})

export const sha256Hex = Effect.fn('sha256Hex')(function* (value: string) {
  return yield* Effect.tryPromise({
    try: async () => {
      const digest = await globalThis.crypto.subtle.digest(
        'SHA-256',
        encoder.encode(value),
      )

      return Hex.encode(new Uint8Array(digest))
    },
    catch: cause =>
      new SyncCryptoError({ message: 'Failed to hash token.', cause }),
  })
})

export const encryptSnapshot = Effect.fn('encryptSnapshot')(function* (
  credentials: Pick<SyncCredentials, 'vaultId' | 'encKeyBase64'>,
  snapshot: VaultSnapshot,
) {
  const keyBytes = yield* decodeBase64Url(credentials.encKeyBase64)

  return yield* Effect.tryPromise({
    try: async () => {
      const subtle = globalThis.crypto.subtle
      const key = await subtle.importKey(
        'raw',
        toArrayBuffer(keyBytes),
        'AES-GCM',
        false,
        ['encrypt'],
      )
      const iv = globalThis.crypto.getRandomValues(new Uint8Array(12))
      const plaintext = encoder.encode(JSON.stringify(snapshot))
      const encrypted = await subtle.encrypt(
        {
          name: 'AES-GCM',
          iv,
          additionalData: encoder.encode(credentials.vaultId),
        },
        key,
        plaintext,
      )

      return `v1:${Base64Url.encode(iv)}.${Base64Url.encode(new Uint8Array(encrypted))}`
    },
    catch: cause =>
      new SyncCryptoError({ message: 'Failed to encrypt snapshot.', cause }),
  })
})

export const decryptSnapshot = Effect.fn('decryptSnapshot')(function* (
  credentials: Pick<SyncCredentials, 'vaultId' | 'encKeyBase64'>,
  ciphertext: string,
) {
  if (!ciphertext.startsWith('v1:')) {
    return yield* new SyncCryptoError({
      message: 'Unsupported ciphertext format.',
    })
  }

  const body = ciphertext.slice(3)
  const dot = body.indexOf('.')

  if (dot <= 0 || dot === body.length - 1) {
    return yield* new SyncCryptoError({ message: 'Malformed ciphertext.' })
  }

  const keyBytes = yield* decodeBase64Url(credentials.encKeyBase64)
  const ivBytes = yield* decodeBase64Url(body.slice(0, dot))
  const dataBytes = yield* decodeBase64Url(body.slice(dot + 1))

  const plaintext = yield* Effect.tryPromise({
    try: async () => {
      const subtle = globalThis.crypto.subtle
      const key = await subtle.importKey(
        'raw',
        toArrayBuffer(keyBytes),
        'AES-GCM',
        false,
        ['decrypt'],
      )
      const decrypted = await subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: toArrayBuffer(ivBytes),
          additionalData: encoder.encode(credentials.vaultId),
        },
        key,
        toArrayBuffer(dataBytes),
      )

      return decoder.decode(decrypted)
    },
    catch: cause =>
      new SyncCryptoError({
        message: 'Failed to decrypt vault. Check your passphrase.',
        cause,
      }),
  })

  return yield* Schema.decodeEffect(VaultSnapshotJson)(plaintext).pipe(
    Effect.mapError(
      cause =>
        new SyncCryptoError({
          message: 'Decrypted vault payload is invalid.',
          cause,
        }),
    ),
  )
})
