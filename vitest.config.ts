import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: [
      'apps/**/*.test.ts',
      'apps/**/*.test.tsx',
      'packages/**/*.test.ts',
    ],
    environment: 'happy-dom',
    setupFiles: ['./apps/web/src/test-setup.ts'],
    server: {
      deps: {
        inline: ['@cycle/domain', '@cycle/sync'],
      },
    },
  },
})
