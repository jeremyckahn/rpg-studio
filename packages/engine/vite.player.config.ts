import { defineConfig } from 'vite'

import { sourceResolve } from '../../tooling/vite.ts'

/**
 * Standalone, minified player: everything (PixiJS included) is bundled into a
 * single `player.js` that exported games load. No editor code is reachable
 * from this entry.
 */
export default defineConfig({
  resolve: sourceResolve,
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
