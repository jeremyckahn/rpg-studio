import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

import { sourceResolve } from '../../tooling/vite.ts'
import { enginePlayer } from './scripts/enginePlayerPlugin.ts'

/** The editor as an installable Progressive Web App (`pnpm build:app` → `dist-app/`). */
export default defineConfig({
  // Relative asset URLs let the same build run from a domain root or a sub-path.
  base: './',
  resolve: sourceResolve,
  plugins: [
    react(),
    enginePlayer(),
    VitePWA({
      // 'prompt': a new version waits until the user accepts it, so a reload never loses unsaved work.
      registerType: 'prompt',
      includeAssets: ['icons/apple-touch-icon.png'],
      manifest: {
        name: 'RPG Studio',
        short_name: 'RPG Studio',
        description: 'Open-source, web-native RPG maker for humans and AI agents.',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        background_color: '#1b1d23',
        theme_color: '#1b1d23',
        categories: ['games', 'developer', 'productivity'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // The editor, the engine player and Piskel all work offline once installed.
        globPatterns: ['**/*.{js,css,html,png,svg,woff,woff2,ico,json}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: 'index.html',
        // Piskel is its own page inside an iframe, not part of the app shell.
        navigateFallbackDenylist: [/\/piskel\//],
        cleanupOutdatedCaches: true,
        // Piskel asks for its icon fonts with a cache-busting query string (icomoon.woff?-3olv93).
        // The precache stores them without one, so ignore every query string when matching, or the
        // icons are missing offline. Nothing in the app depends on a query string.
        ignoreURLParametersMatching: [/.*/],
      },
    }),
  ],
  build: {
    outDir: 'dist-app',
    emptyOutDir: true,
    target: 'es2023',
    sourcemap: true,
    chunkSizeWarningLimit: 2500,
  },
  server: { port: 5173 },
})
