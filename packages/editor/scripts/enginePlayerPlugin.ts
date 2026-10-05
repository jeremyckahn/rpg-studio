import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { type Plugin } from 'vite'

const here = dirname(fileURLToPath(import.meta.url))
const PLAYER = join(here, '..', '..', 'engine', 'dist-player', 'player.js')

/**
 * Ships the pre-built engine player with the editor. The editor fetches it from
 * `engine/player.js` and packs it into every exported game.
 *
 * - In `vite dev` it is served from `@rpgstudio/engine`'s build output.
 * - In `vite build` it is emitted into the app bundle.
 *
 * Build the engine first (`pnpm build`, or `pnpm dev`, which does it for you).
 */
export const enginePlayer = (): Plugin => ({
  name: 'rpgstudio-engine-player',

  configureServer(server) {
    server.middlewares.use((request, response, next) => {
      const path = request.url?.split('?')[0]
      if (path !== `${server.config.base}engine/player.js`) {
        next()
        return
      }
      if (!existsSync(PLAYER)) {
        response.writeHead(404, { 'Content-Type': 'text/plain' })
        response.end('Engine player not built. Run `pnpm --filter @rpgstudio/engine build`.')
        return
      }
      response.writeHead(200, { 'Content-Type': 'text/javascript' })
      response.end(readFileSync(PLAYER))
    })
  },

  generateBundle() {
    if (!existsSync(PLAYER)) {
      this.error('The engine player is missing. Run `pnpm --filter @rpgstudio/engine build` first.')
    }
    this.emitFile({ type: 'asset', fileName: 'engine/player.js', source: readFileSync(PLAYER) })
  },
})
