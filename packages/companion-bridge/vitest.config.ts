import { defineConfig } from 'vitest/config'

import { sourceResolve } from '../../tooling/vite.ts'

export default defineConfig({
  resolve: sourceResolve,
  test: {
    name: '@rpgstudio/companion-bridge',
    include: ['test/**/*.test.ts'],
  },
})
