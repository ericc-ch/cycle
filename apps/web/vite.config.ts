import { fileURLToPath } from 'node:url'
import { defineConfig, searchForWorkspaceRoot } from 'vite'

import { foldkit } from '@foldkit/vite-plugin'
import stylex from '@stylexjs/unplugin'

const rootDir = fileURLToPath(new URL('../..', import.meta.url))

export default defineConfig({
  plugins: [
    stylex.vite({
      useCSSLayers: { before: ['base'] },
      dev: process.env['NODE_ENV'] !== 'production',
      runtimeInjection: false,
      unstable_moduleResolution: { type: 'commonJS', rootDir },
    }),
    foldkit(),
  ],
  optimizeDeps: {
    entries: ['src/entry.ts'],
    exclude: ['@cycle/ui', '@cycle/domain'],
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    fs: {
      allow: [
        searchForWorkspaceRoot(fileURLToPath(new URL('.', import.meta.url))),
      ],
    },
  },
})
