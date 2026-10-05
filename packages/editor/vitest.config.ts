import { defineConfig } from 'vitest/config'

import { sourceResolve, sourceSsr, workspaceServerDeps } from '../../tooling/vite.ts'

export default defineConfig({
  resolve: sourceResolve,
  ssr: sourceSsr,
  test: {
    name: '@rpgstudio/editor',
    include: ['test/**/*.test.{ts,tsx}'],
    setupFiles: ['./test/setup.ts'],
    server: { deps: workspaceServerDeps },
  },
})
