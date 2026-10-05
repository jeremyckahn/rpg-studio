import { defineConfig } from 'vite'

import { libConfig } from '../../tooling/vite.ts'

const base = libConfig({ entry: { index: 'src/index.ts', cli: 'src/cli.ts' }, target: 'node' })

export default defineConfig({
  ...base,
  plugins: [
    {
      // The CLI is an executable: give its chunk a shebang so the package bin works.
      name: 'rpgstudio-cli-shebang',
      renderChunk: (code, chunk) => (chunk.name === 'cli' ? `#!/usr/bin/env node\n${code}` : null),
    },
  ],
})
