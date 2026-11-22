import { Data, Effect } from 'effect'
import { Base64Url } from 'effect/encoding'

export class PushError extends Data.TaggedError('PushError')<{
  readonly message: string
  readonly cause?: unknown
}> {}

const encoder = new TextEncoder()

const ALLOWED_PUSH_EXACT_HOSTS = new Set([
  'fcm.googleapis.com',
  'android.googleapis.com',
  'updates.push.services.mozilla.com',
  'updates-autopush.stage.mozaws.net',
])

const ALLOWED_PUSH_HOST_SUFFIXES = [
  '.push.apple.com',
  '.notify.windows.com',
  '.push.samsungosp.com',
]

export const isAllowedPushEndpoint = (endpoint: string): boolean => {
  if (endpoint.length === 0 || endpoint.length > 2048) {
    return false
  }

  let parsed: URL

  try {
    parsed = new URL(endpoint)
  } catch {
    return false
  }

  if (
    parsed.protocol !== 'https:' ||
    parsed.port !== '' ||
    parsed.username !== '' ||
    parsed.password !== ''
  ) {
    return false
  }

  const host = parsed.hostname.toLowerCase()

  if (ALLOWED_PUSH_EXACT_HOSTS.has(host)) {
    return true
  }

  return ALLOWED_PUSH_HOST_SUFFIXES.some(
    suffix => host.length > suffix.length && host.endsWith(suffix),
  )
}

export type VapidConfig = {
  readonly publicKey: string
  readonly privateKey: string
  readonly subject: string
}

const decodeBase64Url = Effect.fn('decodeBase64Url')(function* (value: string) {
  return yield* Effect.fromResult(Base64Url.decode(value)).pipe(
    Effect.mapError(
      cause => new PushError({ message: 'Invalid base64url VAPID key.', cause }),
    ),
  )
})

const signVapidJwt = Effect.fn('signVapidJwt')(function* (
  endpoint: string,
  vapid: VapidConfig,
  nowMs: number,
) {
  const pubBytes = yield* decodeBase64Url(vapid.publicKey)

  if (pubBytes.length !== 65 || pubBytes[0] !== 0x04) {
    return yield* new PushError({
      message: 'VAPID public key must be an uncompressed P-256 key.',
    })
  }

  const x = Base64Url.encode(pubBytes.slice(1, 33))
  const y = Base64Url.encode(pubBytes.slice(33, 65))
  const audience = new URL(endpoint).origin
  const exp = Math.floor(nowMs / 1000) + 12 * 3600

  const headerB64 = Base64Url.encode(
    encoder.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })),
  )
  const payloadB64 = Base64Url.encode(
    encoder.encode(
      JSON.stringify({ aud: audience, exp, sub: vapid.subject }),
    ),
  )
  const signingInput = `${headerB64}.${payloadB64}`

  const signature = yield* Effect.tryPromise({
    try: async () => {
      const key = await globalThis.crypto.subtle.importKey(
        'jwk',
        {
          kty: 'EC',
          crv: 'P-256',
          x,
          y,
          d: vapid.privateKey,
        },
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['sign'],
      )
      const rawSig = await globalThis.crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        key,
        encoder.encode(signingInput),
      )

      return Base64Url.encode(new Uint8Array(rawSig))
    },
    catch: cause =>
      new PushError({ message: 'Failed to sign VAPID token.', cause }),
  })

  return `${signingInput}.${signature}`
})

export type WebPushSendOutcome =
  | { readonly kind: 'sent'; readonly status: number }
  | { readonly kind: 'gone'; readonly status: number }
  | { readonly kind: 'retry'; readonly status: number }

export const sendEmptyWebPush = Effect.fn('sendEmptyWebPush')(function* (
  endpoint: string,
  vapid: VapidConfig,
  nowMs: number,
  fetchFn: typeof fetch = globalThis.fetch,
): Effect.fn.Return<WebPushSendOutcome, PushError> {
  const jwt = yield* signVapidJwt(endpoint, vapid, nowMs)

  const response = yield* Effect.tryPromise({
    try: () =>
      fetchFn(endpoint, {
        method: 'POST',
        headers: {
          authorization: `vapid t=${jwt}, k=${vapid.publicKey}`,
          ttl: '86400',
          urgency: 'normal',
          'content-length': '0',
        },
      }),
    catch: cause =>
      new PushError({ message: 'Push delivery request failed.', cause }),
  })

  if (response.status >= 200 && response.status < 300) {
    return { kind: 'sent', status: response.status }
  }

  if (
    response.status === 400 ||
    response.status === 403 ||
    response.status === 404 ||
    response.status === 410
  ) {
    return { kind: 'gone', status: response.status }
  }

  return { kind: 'retry', status: response.status }
})
