import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

/** Fails fast, with the fix, when the production build the tests serve does not exist. */
export default function globalSetup(): void {
  const app = resolve(import.meta.dirname, '../../editor/dist-app/index.html')
  const player = resolve(import.meta.dirname, '../../editor/dist-app/engine/player.js')
  if (!existsSync(app) || !existsSync(player)) {
    throw new Error(
      'The editor has not been built. Run `pnpm build && pnpm build:app` before the end-to-end tests.',
    )
  }
}
