import * as Cloudflare from '@alchemy.run/cloudflare'
import * as Alchemy from 'alchemy'
import { adopt } from 'alchemy/AdoptPolicy'
import { Stack } from 'alchemy/Stack'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import * as Redacted from 'effect/Redacted'

const ZONE = 'ericc.ch'

export default Alchemy.Stack(
  'cycle',
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state({ workerName: 'cycle-state' }),
  },
  Effect.gen(function* stack() {
    const context = yield* Effect.serviceOption(Alchemy.AlchemyContext)
    const currentStack = yield* Stack
    const dev = Option.isSome(context) && context.value.dev

    const syncDb = yield* Cloudflare.D1.Database('SyncDb', {
      migrations: 'apps/api/migrations',
    })

    const rateLimit = Cloudflare.Workers.RateLimit('RATE_LIMIT_SYNC', {
      namespaceId: 21001,
      simple: { limit: 60, period: 60 },
    })

    const vapidEnv =
      process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY
        ? {
            VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY,
            VAPID_PRIVATE_KEY: Redacted.make(process.env.VAPID_PRIVATE_KEY),
            VAPID_SUBJECT: process.env.VAPID_SUBJECT ?? `https://cycle.${ZONE}`,
          }
        : {}

    if (dev) {
      const api = yield* Cloudflare.Workers.Worker('Api', {
        main: 'apps/api/src/worker.ts',
        workersDev: true,
        crons: ['0 * * * *'],
        dev: {
          port: 8787,
          strictPort: true,
        },
        env: {
          DB: syncDb,
          RATE_LIMIT_SYNC: rateLimit,
          ...vapidEnv,
        },
      })

      return {
        api: api.url,
      }
    }

    const zone = yield* Cloudflare.Zone.Zone('Zone', { name: ZONE }).pipe(
      adopt(true),
    )

    const host =
      currentStack.stage === 'prod'
        ? `cycle.${ZONE}`
        : `cycle-${currentStack.stage}.${ZONE}`

    yield* Cloudflare.DNS.Record('Host', {
      zoneId: zone.zoneId,
      name: host,
      type: 'AAAA',
      content: '100::',
      proxied: true,
    }).pipe(adopt(true))

    const api = yield* Cloudflare.Workers.Worker('Api', {
      main: 'apps/api/src/worker.ts',
      workersDev: false,
      crons: ['0 * * * *'],
      routes: [{ pattern: `${host}/api/*`, zoneId: zone.zoneId }],
      env: {
        DB: syncDb,
        RATE_LIMIT_SYNC: rateLimit,
        ...vapidEnv,
      },
    })

    const web = yield* Cloudflare.Website.StaticSite('Web', {
      command: 'pnpm --filter @cycle/web build',
      outdir: 'apps/web/dist',
      routes: [{ pattern: `${host}/*`, zoneId: zone.zoneId }],
      assets: { notFoundHandling: 'single-page-application' },
    })

    return {
      url: `https://${host}`,
      api: api.url,
      web: web.url,
    }
  }),
)
