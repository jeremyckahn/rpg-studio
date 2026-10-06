import { defineConfig } from 'vitest/config'

import { sourceResolve, sourceSsr, workspaceServerDeps } from './vite.ts'

export default defineConfig({
  resolve: sourceResolve,
  ssr: sourceSsr,
  test: {
    name: 'tooling',
    include: ['*.test.ts'],
    server: { deps: workspaceServerDeps },
  },
})
