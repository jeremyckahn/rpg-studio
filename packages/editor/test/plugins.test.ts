import { type PluginManifest, CapabilityDeniedError, loadPluginPackage } from '@rpgstudio/core'
import { describe, expect, it } from 'vitest'

import { type EditorCapabilities, createEditorPluginHost } from '../src/plugins/editorHost'
import { type PanelDefinition, createPanelRegistry } from '../src/plugins/panelRegistry'
import { createAssetStore } from '../src/project/assetStore'
import { createEditorStore } from '../src/store'
import { recorder, sampleProject } from './helpers'

const Panel = (): null => null

const setup = () => {
  const handle = createEditorStore({ project: sampleProject() })
  const assets = createAssetStore()
  const panels = createPanelRegistry()
  const host = createEditorPluginHost({ handle, assets, panels })
  return { handle, assets, panels, host }
}

const manifest = (id: string, capabilities: PluginManifest['capabilities']) => ({
  id,
  name: id,
  version: '1.0.0',
  capabilities,
  entries: { editor: 'editor.js' },
})

type Ctx = Parameters<
  NonNullable<
    Parameters<ReturnType<typeof setup>['host']['manager']['register']>[0]['module']
  >['initialize'] &
    object
>[0]

/** Registers a plugin whose initialize captures its context. */
const run = async (capabilities: PluginManifest['capabilities'], id = 'acme.test') => {
  const env = setup()
  const contexts = recorder<Ctx>()
  env.host.manager.register({
    manifest: manifest(id, capabilities),
    module: {
      initialize: (ctx) => {
        contexts.record(ctx)
      },
    },
  })
  await env.host.manager.initialize()
  const [ctx] = contexts.values
  if (!ctx) throw new Error('not initialized')
  return {
    ...env,
    ctx: ctx as unknown as EditorCapabilities & { onDispose: (f: () => void) => void },
  }
}

describe('panel registry', () => {
  const panel = (id: string, order?: number): PanelDefinition => ({
    id,
    title: id,
    location: 'workspace',
    component: Panel,
    ...(order === undefined ? {} : { order }),
  })

  it('lists panels by order and notifies listeners with a new array identity on change', () => {
    const registry = createPanelRegistry()
    const changes = recorder<number>()
    registry.subscribe(() => {
      changes.record(registry.list().length)
    })
    const before = registry.list()
    registry.register(panel('b', 20))
    registry.register(panel('a', 10))
    registry.register(panel('c'))
    expect(registry.list().map((p) => p.id)).toEqual(['a', 'b', 'c'])
    expect(registry.list()).not.toBe(before)
    expect(changes.values).toEqual([1, 2, 3])
    expect(registry.list()).toBe(registry.list()) // stable between changes, as useSyncExternalStore needs
  })

  it('removes a panel via its unregister function and rejects duplicate ids', () => {
    const registry = createPanelRegistry()
    const remove = registry.register(panel('a'))
    expect(() => registry.register(panel('a'))).toThrow(/already registered/)
    remove()
    expect(registry.list()).toEqual([])
    registry.register(panel('a'))
  })

  it('stops notifying unsubscribed listeners', () => {
    const registry = createPanelRegistry()
    const changes = recorder<number>()
    const stop = registry.subscribe(() => {
      changes.record(1)
    })
    stop()
    registry.register(panel('a'))
    expect(changes.values).toEqual([])
  })
})

describe('editor plugin host capabilities', () => {
  it('serves store, ui and file capabilities only to plugins that declare them', async () => {
    const { ctx } = await run([])
    ;(['store', 'ui', 'readFiles', 'writeFiles'] as const).forEach((key) => {
      expect(() => ctx[key], key).toThrow(CapabilityDeniedError)
    })
  })

  it('registers panels through ui and removes them when the plugin is torn down', async () => {
    const { ctx, panels, host } = await run(['ui'])
    ctx.ui.registerPanel({ id: 'acme.panel', title: 'Acme', location: 'right', component: Panel })
    expect(panels.list().map((p) => p.id)).toEqual(['acme.panel'])
    await host.manager.teardown()
    expect(panels.list()).toEqual([])
  })

  it('exposes the host React and MUI so a plugin can build UI without importing them', async () => {
    const { ctx } = await run(['ui'])
    expect(ctx.ui.kit.React.createElement).toBeTypeOf('function')
    expect(ctx.ui.kit.mui.Button).toBeDefined()
    expect(ctx.ui.kit.hooks.useSelector).toBeTypeOf('function')
  })

  describe('store', () => {
    it('validates untrusted actions with Zod and applies them through the pure operation', async () => {
      const { ctx, handle } = await run(['store'])
      const good = ctx.store.dispatchProjectAction({
        type: 'project/setTiles',
        payload: { mapId: 1, layer: 0, cells: [{ x: 0, y: 0, tile: 4 }] },
      })
      expect(good).toEqual({ success: true, data: undefined })
      expect(handle.store.getState().project.data.maps[0]?.layers[0]?.data[0]).toBe(4)
    })

    it('refuses malformed, hallucinated and unknown actions without touching state', async () => {
      const { ctx, handle } = await run(['store'])
      const before = handle.store.getState().project
      const attempts: unknown[] = [
        { type: 'project/setTiles', payload: { mapId: 1, layer: 0, cells: [] } },
        {
          type: 'project/setTiles',
          payload: { mapId: 1, layer: 0, cells: [{ x: 0, y: 0, tile: 1 }], evil: 1 },
        },
        { type: 'project/projectLoaded', payload: {} },
        { type: 'history/undo' },
        'drop table',
        null,
      ]
      attempts.forEach((attempt) => {
        expect(ctx.store.dispatchProjectAction(attempt).success).toBe(false)
      })
      expect(handle.store.getState().project).toBe(before)
    })

    it('reports why a well-formed action was refused', async () => {
      const { ctx } = await run(['store'])
      const result = ctx.store.dispatchProjectAction({
        type: 'project/setTiles',
        payload: { mapId: 1, layer: 0, cells: [{ x: 99, y: 0, tile: 1 }] },
      })
      expect(result.success).toBe(false)
      expect(!result.success && result.error).toMatch(/outside/)
    })

    it('gives read access to the project and state, and subscriptions end on teardown', async () => {
      const { ctx, handle, host } = await run(['store'])
      expect(ctx.store.getProject().meta.name).toBe('Sample')
      expect(ctx.store.select((state) => state.project.revision)).toBe(0)
      const changes = recorder<number>()
      ctx.store.subscribe(() => {
        changes.record(1)
      })
      handle.store.dispatch({ type: 'noop' })
      await host.manager.teardown()
      handle.store.dispatch({ type: 'noop' })
      expect(changes.values).toHaveLength(1)
    })

    it('lets a plugin add its own reducer at runtime, namespaced, and reuses it when asked again', async () => {
      const { ctx, handle } = await run(['store'], 'acme.quests')
      const slice = ctx.store.registerSlice({
        name: 'log',
        initialState: { entries: [] as readonly string[] },
        reducers: {
          added: (state, payload) => ({ entries: [...state.entries, String(payload)] }),
        },
      })
      const added = slice.actions['added']
      if (!added) throw new Error('missing action')
      expect(added('x').type).toBe('plugin/acme.quests/log/added')
      handle.store.dispatch(added('first'))
      handle.store.dispatch(added('second'))
      expect(slice.select(handle.store.getState())).toEqual({ entries: ['first', 'second'] })
      const again = ctx.store.registerSlice({
        name: 'log',
        initialState: { entries: [] },
        reducers: {},
      })
      expect(again).toBe(slice)
    })

    it('keeps one plugin’s reducer from touching another’s or the core state', async () => {
      const { ctx, handle } = await run(['store'], 'acme.one')
      const slice = ctx.store.registerSlice({
        name: 's',
        initialState: { n: 0 },
        reducers: { bump: (state) => ({ n: state.n + 1 }) },
      })
      const before = handle.store.getState().project
      const bump = slice.actions['bump']
      if (!bump) throw new Error('missing action')
      handle.store.dispatch(bump())
      expect(handle.store.getState().project).toBe(before)
      expect(Object.keys(handle.store.getState())).toEqual(
        expect.arrayContaining(['project', 'history', 'editorUi', 'assets', 'plugin_acme_one_s']),
      )
    })
  })

  describe('files', () => {
    it('reads any asset', async () => {
      const { ctx, assets } = await run(['files:read'])
      assets.write('img/a.png', 'png')
      assets.write('audio/se/x.ogg', 'ogg')
      expect(ctx.readFiles.list()).toEqual(['audio/se/x.ogg', 'img/a.png'])
      expect(ctx.readFiles.readText('img/a.png')).toBe('png')
      expect(ctx.readFiles.readBytes('missing')).toBeUndefined()
    })

    it('writes images, audio and its own folder, but never project data or other plugins', async () => {
      const { ctx, assets } = await run(['files:write'], 'acme.writer')
      ctx.writeFiles.write('img/characters/new.png', 'x')
      ctx.writeFiles.write('audio/bgm/new.ogg', 'x')
      ctx.writeFiles.write('plugins/acme.writer/state.json', '{}')
      expect(assets.list()).toHaveLength(3)
      ;[
        'project.json',
        'data/actors.json',
        'maps/map-001.json',
        'plugins/other/engine.js',
        'src/x.ts',
      ].forEach((path) => {
        expect(() => {
          ctx.writeFiles.write(path, 'evil')
        }, path).toThrow(/may not write/)
      })
      expect(() => {
        ctx.writeFiles.remove('plugins/other/engine.js')
      }).toThrow(/may not remove/)
      ctx.writeFiles.remove('img/characters/new.png')
      expect(assets.has('img/characters/new.png')).toBe(false)
    })

    it('rejects traversal even inside an allowed folder', async () => {
      const { ctx } = await run(['files:write'])
      expect(() => {
        ctx.writeFiles.write('img/../project.json', 'x')
      }).toThrow()
    })
  })

  it('loads a third-party plugin from source text and runs it against the host', async () => {
    const { host, panels, handle } = setup()
    const registration = await loadPluginPackage(
      {
        'manifest.json': JSON.stringify(manifest('acme.blob', ['ui', 'store'])),
        'editor.js': `export default {
          initialize(ctx) {
            const { React, mui } = ctx.ui.kit
            ctx.ui.registerPanel({
              id: 'acme.blob.panel', title: 'Blob', location: 'bottom',
              component: () => React.createElement(mui.Typography, null, 'from a blob'),
            })
            ctx.store.dispatchProjectAction({ type: 'project/renameMap', payload: { mapId: 1, name: 'Renamed by plugin' } })
          },
        }`,
      },
      'editor',
    )
    host.manager.register(registration)
    await host.manager.initialize()
    expect(panels.list().map((p) => p.id)).toEqual(['acme.blob.panel'])
    expect(handle.store.getState().project.data.maps[0]?.name).toBe('Renamed by plugin')
  })

  it('refuses plugins that ask for capabilities the editor does not offer', () => {
    const { host } = setup()
    expect(() => {
      host.manager.register({ manifest: manifest('acme.render', ['render']) })
    }).toThrow(/does not provide: render/)
  })
})
