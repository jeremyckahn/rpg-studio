import { join } from 'node:path'

import { type Rolldown } from 'vite'
import { build } from 'vite'
import { describe, expect, it } from 'vitest'

/** Builds the real player bundle in memory, exactly as `pnpm build` does. */
const buildPlayer = async (): Promise<string> => {
  const result = await build({
    configFile: join(__dirname, '..', 'vite.player.config.ts'),
    logLevel: 'silent',
    build: { write: false, minify: false },
  })
  const outputs = (Array.isArray(result) ? result : [result]) as Rolldown.RolldownOutput[]
  const chunk = outputs.flatMap((output) => output.output).find((item) => item.type === 'chunk')
  if (!chunk || chunk.type !== 'chunk') throw new Error('The player build produced no chunk')
  return chunk.code
}

describe('player bundle', () => {
  it('runs in a browser: no Node-only globals and no CommonJS wrappers left over', async () => {
    const code = await buildPlayer()
    // Browsers have no `process`, `Buffer` or `require`; a leftover reference is a crash on load.
    expect(code).not.toMatch(/\bprocess\.env\b/)
    expect(code).not.toMatch(/\bBuffer\.from\b/)
    expect(code).not.toMatch(/\brequire\(['"]/)
    expect(code.length).toBeGreaterThan(100_000) // PixiJS and the engine are bundled in
  }, 60_000)

  it('exports startPlayer and contains no editor code', async () => {
    const code = await buildPlayer()
    expect(code).toMatch(/export\s*\{[^}]*\bstartPlayer\b/)
    expect(code).not.toMatch(/@mui\/|react-redux|@reduxjs\/toolkit|react-dom/)
  }, 60_000)
})
