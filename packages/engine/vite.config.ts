import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'RPGStudioEngine',
      formats: ['es'],
      fileName: 'index',
    },
    rollupOptions: {
      external: ['pixi.js', '@pixi/tilemap', '@pixi/sound', 'miniplex', '@rpgstudio/core'],
    },
    sourcemap: true,
  },
});
