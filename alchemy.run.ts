import * as Cloudflare from '@alchemy.run/cloudflare'
import * as Alchemy from 'alchemy'
import { adopt } from 'alchemy/AdoptPolicy'
import { Stack } from 'alchemy/Stack'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'

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

    if (dev) {
      const api = yield* Cloudflare.Workers.Worker('Api', {
        main: 'apps/api/src/worker.ts',
        workersDev: true,
        dev: {
          port: 8787,
          strictPort: true,
        },
        env: {
          DB: syncDb,
          RATE_LIMIT_SYNC: rateLimit,
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
      routes: [{ pattern: `${host}/api/*`, zoneId: zone.zoneId }],
      env: {
        DB: syncDb,
        RATE_LIMIT_SYNC: rateLimit,
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
