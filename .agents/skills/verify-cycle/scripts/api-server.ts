import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'

import {
  type D1DatabaseLike,
  type D1PreparedStatementLike,
  createSyncWorker,
} from '../../../../apps/api/src/worker.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..')
const PORT = Number(process.env.VERIFY_API_PORT ?? 8787)

const sqlite = new DatabaseSync(':memory:')
sqlite.exec(
  readFileSync(join(ROOT, 'apps/api/migrations/0001_vaults.sql'), 'utf8'),
)

const d1: D1DatabaseLike = {
  prepare(query) {
    const stmt = sqlite.prepare(query)
    const bind = (
      params: ReadonlyArray<unknown>,
    ): D1PreparedStatementLike => ({
      bind: (...values) => bind(values),
      first: async () => {
        const row = stmt.get(...(params as ReadonlyArray<string | number>))

        if (row === undefined) {
          return null
        }

        return {
          vault_id: String(row.vault_id),
          auth_hash: String(row.auth_hash),
          version: Number(row.version),
          ciphertext: String(row.ciphertext),
        }
      },
      run: async () => {
        const result = stmt.run(...(params as ReadonlyArray<string | number>))

        return { meta: { changes: Number(result.changes) } }
      },
    })

    return bind([])
  },
}

const worker = createSyncWorker()

const server = createServer(async (req, res) => {
  const chunks: Buffer[] = []

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  const method = req.method ?? 'GET'
  const url = `http://127.0.0.1:${PORT}${req.url ?? '/'}`
  const headers = new Headers()

  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') {
      headers.set(key, value)
    }
  }

  const body =
    method === 'GET' || method === 'HEAD' ? undefined : Buffer.concat(chunks)
  const response = await worker.fetch(
    new Request(url, { method, headers, body }),
    { DB: d1 },
  )

  res.statusCode = response.status
  response.headers.forEach((value, key) => res.setHeader(key, value))
  res.end(Buffer.from(await response.arrayBuffer()))
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`api ready on http://127.0.0.1:${PORT}/`)
})
