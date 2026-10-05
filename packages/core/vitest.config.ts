import { defineConfig } from 'vitest/config'

import { sourceResolve, sourceSsr, workspaceServerDeps } from '../../tooling/vite.ts'

export default defineConfig({
  resolve: sourceResolve,
  ssr: sourceSsr,
  test: {
    name: '@rpgstudio/core',
    include: ['test/**/*.test.ts'],
    server: { deps: workspaceServerDeps },
  },
})
