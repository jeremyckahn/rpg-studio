import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'RPGStudioEditor',
      formats: ['es'],
      fileName: 'index',
    },
    rollupOptions: {
      external: [
        'react',
        'react-dom',
        'react-redux',
        '@reduxjs/toolkit',
        '@mui/material',
        '@mui/icons-material',
        '@emotion/react',
        '@emotion/styled',
        'pixi.js',
        'fflate',
        '@rpgstudio/core',
        '@rpgstudio/engine',
      ],
    },
    sourcemap: true,
  },
});
