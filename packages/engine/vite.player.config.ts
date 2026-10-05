import { defineConfig } from 'vite'

import { sourceResolve } from '../../tooling/vite.ts'

/**
 * Standalone, minified player: everything (PixiJS included) is bundled into a
 * single `player.js` that exported games load. No editor code is reachable
 * from this entry.
 */
export default defineConfig({
  resolve: sourceResolve,
  // Library mode leaves `process.env.NODE_ENV` for the consumer to replace, but the player
  // is the consumer: browsers have no `process`.
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    outDir: 'dist-player',
    emptyOutDir: true,
    target: 'es2023',
    sourcemap: false,
    minify: true,
    lib: {
      entry: 'src/player/main.ts',
      formats: ['es'],
      fileName: () => 'player.js',
    },
    rollupOptions: {
      output: { codeSplitting: false },
    },
  },
})
