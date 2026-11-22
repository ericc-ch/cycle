import { fileURLToPath } from 'node:url'
import { defineConfig, searchForWorkspaceRoot } from 'vite'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    entries: ['src/entry.tsx'],
    exclude: ['@cycle/domain', '@cycle/sync'],
  },
  server: {
    // 0.0.0.0 so a phone can reach it over the LAN or Tailscale. Any host
    // header is accepted, which is what lets a tailnet name through.
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
    proxy: {
      '/api': 'http://127.0.0.1:8787',
    },
    fs: {
      allow: [
        searchForWorkspaceRoot(fileURLToPath(new URL('.', import.meta.url))),
      ],
    },
  },
})
