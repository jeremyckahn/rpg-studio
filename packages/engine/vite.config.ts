import { defineConfig } from 'vite'

import { libConfig } from '../../tooling/vite.ts'

export default defineConfig(libConfig({ entry: 'src/index.ts' }))
