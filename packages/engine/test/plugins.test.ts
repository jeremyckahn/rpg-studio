import { loadPluginPackage, type PluginManifest } from '@rpgstudio/core'
import { describe, expect, it } from 'vitest'

import { createEnginePluginManager, createHeadlessGame } from '../src'
import { buildProject } from './fixtures'

const files = (engineSource: string) => ({
  'manifest.json': JSON.stringify({
    id: 'acme.counter',
    name: 'Counter',
    version: '1.0.0',
    capabilities: ['ecs', 'audio'],
    entries: { shared: 'shared.js', editor: 'editor.js', engine: 'engine.js' },
  } satisfies Partial<PluginManifest>),
  'shared.js': 'export default { VARIABLE: 7 }',
  'editor.js': 'throw new Error("editor code must never load in the engine")',
  'engine.js': engineSource,
})

describe('engine plugin host', () => {
  it('runs a plugin system every tick and stops it on teardown', async () => {
    const headless = createHeadlessGame(buildProject())
    const manager = createEnginePluginManager(headless.game, { audio: headless.audio })
    manager.register(
      await loadPluginPackage(
        files(`export default {
          initialize(ctx, shared) {
            ctx.ecs.addSystem((game) => {
              game.state.variables[shared.VARIABLE] = (game.state.variables[shared.VARIABLE] ?? 0) + 1
            })
            ctx.audio.play('se', { name: 'plugin-ready', volume: 50, pitch: 100 })
          },
        }`),
        'engine',
      ),
    )
    await manager.initialize()
    headless.simulateTicks(5)
    expect(headless.game.snapshot().variables[7]).toBe(5)
    expect(headless.audio.calls()).toContainEqual({
      action: 'play',
      tier: 'se',
      cue: { name: 'plugin-ready', volume: 50, pitch: 100 },
    })

    await manager.teardown()
    headless.simulateTicks(5)
    expect(headless.game.snapshot().variables[7]).toBe(5)
  })

  it('never evaluates the editor entry, even though the manifest lists one', async () => {
    const headless = createHeadlessGame(buildProject())
    const manager = createEnginePluginManager(headless.game, { audio: headless.audio })
    manager.register(await loadPluginPackage(files('export default {}'), 'engine'))
    await expect(manager.initialize()).resolves.toBeUndefined()
  })

  it('denies capabilities the manifest did not request', async () => {
    const headless = createHeadlessGame(buildProject())
    const manager = createEnginePluginManager(headless.game, { audio: headless.audio })
    const pack = files('export default { initialize(ctx) { ctx.log.info("nope") } }')
    manager.register(await loadPluginPackage(pack, 'engine'))
    await expect(manager.initialize()).rejects.toThrow(/failed to initialize/)
  })

  it('refuses plugins that ask for editor-only capabilities', () => {
    const headless = createHeadlessGame(buildProject())
    const manager = createEnginePluginManager(headless.game, { audio: headless.audio })
    expect(() => {
      manager.register({
        manifest: {
          id: 'acme.ui',
          name: 'UI',
          version: '1.0.0',
          capabilities: ['ui'],
          entries: { engine: 'engine.js' },
        },
      })
    }).toThrow(/does not provide: ui/)
  })
})
