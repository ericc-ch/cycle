import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

import stylex from '@stylexjs/unplugin'

const rootDir = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  plugins: [
    stylex.vite({
      dev: true,
      runtimeInjection: true,
      unstable_moduleResolution: { type: 'commonJS', rootDir },
    }),
  ],
  resolve: {
    dedupe: ['foldkit', '@foldkit/ui', 'effect'],
  },
  test: {
    include: ['apps/**/*.test.ts', 'packages/**/*.test.ts'],
    environment: 'happy-dom',
    setupFiles: ['./vitest-setup.ts'],
    server: {
      deps: {
        inline: ['foldkit', '@foldkit/ui', '@cycle/ui', '@cycle/domain'],
      },
    },
  },
})
