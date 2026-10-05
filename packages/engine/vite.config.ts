import { defineConfig } from 'vite'

import { libConfig } from '../../tooling/vite.ts'

export default defineConfig(
  libConfig({
    entry: {
      index: 'src/index.ts',
      renderer: 'src/renderer/index.ts',
      audio: 'src/audio/index.ts',
      player: 'src/player/index.ts',
    },
  }),
)
