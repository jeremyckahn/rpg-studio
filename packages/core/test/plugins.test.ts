import { describe, expect, it, vi } from 'vitest'

import { recorder } from './helpers'
import {
  CapabilityDeniedError,
  type CoreCapabilities,
  type LogEntry,
  type ModuleImporter,
  type PluginModule,
  PluginDependencyError,
  PluginInitializationError,
  PluginPolicyError,
  PluginRegistrationError,
  createCoreCapabilityProviders,
  createCoreHost,
  createPluginManager,
  importModuleFromSource,
  loadPluginPackage,
  parsePluginManifest,
} from '../src'

const manifest = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: id,
  version: '1.0.0',
  capabilities: [],
  entries: { editor: 'editor.js' },
  ...extra,
})

const setup = () => {
  const log = recorder<LogEntry>()
  const host = createCoreHost(log.record)
  const manager = createPluginManager<CoreCapabilities>({
    target: 'editor',
    host,
    providers: createCoreCapabilityProviders(host),
  })
  return {
    host,
    manager,
    get logs() {
      return log.values
    },
  }
}

describe('PluginManager lifecycle', () => {
  it('registers, initializes and tears down in order, passing shared exports', async () => {
    const { manager } = setup()
    const log = recorder<string>()
    const module = (name: string): PluginModule => ({
      onRegister: () => {
        log.record(`register:${name}`)
      },
      initialize: (_ctx, shared) => {
        log.record(`init:${name}:${JSON.stringify(shared)}`)
      },
      teardown: () => {
        log.record(`teardown:${name}`)
      },
    })
    manager.register({ manifest: manifest('a'), module: module('a'), shared: { n: 1 } })
    manager.register({ manifest: manifest('b'), module: module('b') })
    expect(log.values).toEqual(['register:a', 'register:b'])
    expect(manager.get('a')?.state).toBe('registered')

    await manager.initialize()
    expect(log.values.slice(2)).toEqual(['init:a:{"n":1}', 'init:b:undefined'])
    expect(manager.list().map((plugin) => plugin.state)).toEqual(['initialized', 'initialized'])

    await manager.teardown()
    expect(log.values.slice(4)).toEqual(['teardown:b', 'teardown:a'])
    expect(manager.get('a')?.state).toBe('registered')
  })

  it('initializes dependencies first regardless of registration order', async () => {
    const { manager } = setup()
    const order = recorder<string>()
    const track = (name: string): PluginModule => ({
      initialize: () => {
        order.record(name)
      },
    })
    manager.register({ manifest: manifest('app', { dependencies: ['lib'] }), module: track('app') })
    manager.register({
      manifest: manifest('lib', { dependencies: ['base'] }),
      module: track('lib'),
    })
    manager.register({ manifest: manifest('base'), module: track('base') })
    await manager.initialize()
    expect(order.values).toEqual(['base', 'lib', 'app'])
    await manager.teardown()
  })

  it('refuses to initialize anything when a dependency is missing', async () => {
    const { manager } = setup()
    const init = vi.fn()
    manager.register({ manifest: manifest('a'), module: { initialize: init } })
    manager.register({
      manifest: manifest('b', { dependencies: ['ghost'] }),
      module: { initialize: init },
    })
    await expect(manager.initialize()).rejects.toThrow(PluginDependencyError)
    expect(init).not.toHaveBeenCalled()
  })

  it('detects dependency cycles', async () => {
    const { manager } = setup()
    manager.register({ manifest: manifest('a', { dependencies: ['b'] }) })
    manager.register({ manifest: manifest('b', { dependencies: ['a'] }) })
    await expect(manager.initialize()).rejects.toThrow(/Circular plugin dependency: a -> b -> a/)
  })

  it('rolls back plugins initialized earlier in the same call when one fails', async () => {
    const { manager, host } = setup()
    const teardownA = vi.fn()
    const failures = recorder<string>()
    host.bus.on('plugin:failed', ({ pluginId }) => {
      failures.record(pluginId)
    })
    manager.register({ manifest: manifest('a'), module: { teardown: teardownA } })
    manager.register({
      manifest: manifest('b', { dependencies: ['a'] }),
      module: {
        initialize: () => {
          throw new Error('kaput')
        },
      },
    })
    const error = await manager.initialize().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(PluginInitializationError)
    expect((error as PluginInitializationError).cause).toEqual(new Error('kaput'))
    expect(teardownA).toHaveBeenCalledOnce()
    expect(manager.get('a')?.state).toBe('registered')
    expect(manager.get('b')?.state).toBe('failed')
    expect(failures.values).toEqual(['b'])
  })

  it('runs every teardown step even when some fail, then reports them all', async () => {
    const { manager } = setup()
    const teardownB = vi.fn()
    manager.register({
      manifest: manifest('a'),
      module: {
        initialize: (ctx) =>
          ctx.onDispose(() => {
            throw new Error('dispose failed')
          }),
        teardown: () => {
          throw new Error('teardown failed')
        },
      },
    })
    manager.register({ manifest: manifest('b'), module: { teardown: teardownB } })
    await manager.initialize()
    await expect(manager.teardown()).rejects.toThrow(AggregateError)
    expect(teardownB).toHaveBeenCalledOnce()
  })

  it('runs disposers last-in first-out and allows re-initialization', async () => {
    const { manager } = setup()
    const order = recorder<string>()
    const initialize = vi.fn((ctx: Parameters<NonNullable<PluginModule['initialize']>>[0]) => {
      ctx.onDispose(() => {
        order.record('first')
      })
      ctx.onDispose(() => {
        order.record('second')
      })
    })
    manager.register({ manifest: manifest('a'), module: { initialize } })
    await manager.initialize()
    await manager.teardown()
    expect(order.values).toEqual(['second', 'first'])
    await manager.initialize()
    expect(initialize).toHaveBeenCalledTimes(2)
    await manager.teardown()
  })

  it('does not initialize a plugin twice', async () => {
    const { manager } = setup()
    const initialize = vi.fn()
    manager.register({ manifest: manifest('a'), module: { initialize } })
    await manager.initialize()
    await manager.initialize()
    expect(initialize).toHaveBeenCalledOnce()
  })

  it('only unregisters plugins that are not running', async () => {
    const { manager } = setup()
    manager.register({ manifest: manifest('a') })
    await manager.initialize()
    expect(() => manager.unregister('a')).toThrow(PluginRegistrationError)
    await manager.teardown()
    manager.unregister('a')
    expect(manager.get('a')).toBeUndefined()
  })

  it('emits lifecycle events on the shared bus', async () => {
    const { manager, host } = setup()
    const seen = recorder<string>()
    host.bus.on('plugin:registered', ({ pluginId }) => {
      seen.record(`registered:${pluginId}`)
    })
    host.bus.on('plugin:initialized', ({ pluginId }) => {
      seen.record(`initialized:${pluginId}`)
    })
    host.bus.on('plugin:teardown', ({ pluginId }) => {
      seen.record(`teardown:${pluginId}`)
    })
    manager.register({ manifest: manifest('a') })
    await manager.initialize()
    await manager.teardown()
    expect(seen.values).toEqual(['registered:a', 'initialized:a', 'teardown:a'])
  })
})

describe('PluginManager registration validation', () => {
  it('rejects malformed manifests, including unknown fields', () => {
    const { manager } = setup()
    expect(() => manager.register({ manifest: { id: 'x' } })).toThrow(PluginRegistrationError)
    expect(() => manager.register({ manifest: manifest('a', { autorun: 'rm -rf /' }) })).toThrow(
      PluginRegistrationError,
    )
    expect(() => manager.register({ manifest: manifest('a', { capabilities: ['sudo'] }) })).toThrow(
      PluginRegistrationError,
    )
    expect(() => manager.register({ manifest: null })).toThrow(PluginRegistrationError)
  })

  it('rejects duplicate ids', () => {
    const { manager } = setup()
    manager.register({ manifest: manifest('a') })
    expect(() => manager.register({ manifest: manifest('a') })).toThrow(/already registered/)
  })

  it('rejects capabilities the host does not provide', () => {
    const { manager } = setup()
    expect(() =>
      manager.register({ manifest: manifest('a', { capabilities: ['store', 'ui'] }) }),
    ).toThrow(/does not provide: store, ui/)
  })
})

describe('capability sandboxing', () => {
  const capture = async (capabilities: string[], extra: Record<string, unknown> = {}) => {
    const env = setup()
    const contexts = recorder<Parameters<NonNullable<PluginModule['initialize']>>[0]>()
    env.manager.register({
      manifest: manifest('sandbox', { capabilities, ...extra }),
      module: {
        initialize: (ctx) => {
          contexts.record(ctx)
        },
      },
    })
    await env.manager.initialize()
    const [ctx] = contexts.values
    if (!ctx) throw new Error('plugin was not initialized')
    return { ...env, ctx, readLogs: () => env.logs }
  }

  it('throws CapabilityDeniedError for every undeclared capability', async () => {
    const { ctx } = await capture([])
    expect(() => ctx.events).toThrow(CapabilityDeniedError)
    expect(() => ctx.schemas).toThrow(CapabilityDeniedError)
    expect(() => ctx.log).toThrow(/did not declare the "log" capability/)
    const keys = ['store', 'ui', 'readFiles', 'writeFiles', 'ecs', 'render', 'audio'] as const
    keys.forEach((key) => {
      expect(() => (ctx as unknown as Record<string, unknown>)[key], key).toThrow(
        CapabilityDeniedError,
      )
    })
  })

  it('grants exactly the declared capabilities', async () => {
    const { ctx } = await capture(['events'])
    expect(ctx.events).toBeDefined()
    expect(() => ctx.log).toThrow(CapabilityDeniedError)
    expect(ctx.pluginId).toBe('sandbox')
    expect(ctx.target).toBe('editor')
  })

  it('exposes a frozen context and manifest', async () => {
    const { ctx } = await capture(['log'])
    expect(Object.isFrozen(ctx)).toBe(true)
    expect(Object.isFrozen(ctx.manifest)).toBe(true)
    expect(Object.isFrozen(ctx.manifest.capabilities)).toBe(true)
    // Reflect reports rejected writes as `false` instead of throwing.
    expect(Reflect.set(ctx, 'pluginId', 'other')).toBe(false)
    expect(Reflect.defineProperty(ctx, 'sneaky', { value: 1 })).toBe(false)
    expect(Reflect.set(ctx.manifest.capabilities, 0, 'store')).toBe(false)
    expect(Object.getPrototypeOf(ctx)).toBeNull()
  })

  it('routes log output to the host sink tagged with the plugin id', async () => {
    const { ctx, readLogs } = await capture(['log'])
    ctx.log.warn('careful', { n: 1 })
    expect(readLogs()).toEqual([
      { level: 'warn', pluginId: 'sandbox', message: 'careful', data: { n: 1 } },
    ])
  })

  it('namespaces plugin events and validates names and payloads', async () => {
    const { ctx, host } = await capture(['events'])
    const seen = recorder<unknown>()
    host.bus.on('custom', (event) => {
      seen.record(event)
    })
    ctx.events.emit('quest.started', { id: 1 })
    expect(seen.values).toEqual([{ name: 'sandbox:quest.started', payload: { id: 1 } }])
    expect(() => ctx.events.emit('bad name!', 1)).toThrow(PluginPolicyError)
    expect(() => ctx.events.emit('ok', { fn: () => 1 } as never)).toThrow(/strict JSON/)
    expect(() => ctx.events.emit('ok', { when: new Date() } as never)).toThrow(/strict JSON/)
  })

  it('drops event subscriptions when the plugin is torn down', async () => {
    const { ctx, host, manager } = await capture(['events'])
    const core = vi.fn()
    const custom = vi.fn()
    ctx.events.on('asset:changed', core)
    ctx.events.listen('other:thing', custom)
    host.bus.emit('asset:changed', { path: 'img/a.png' })
    host.bus.emit('custom', { name: 'other:thing', payload: 5 })
    expect(core).toHaveBeenCalledWith({ path: 'img/a.png' })
    expect(custom).toHaveBeenCalledWith(5)

    await manager.teardown()
    host.bus.emit('asset:changed', { path: 'img/b.png' })
    host.bus.emit('custom', { name: 'other:thing', payload: 6 })
    expect(core).toHaveBeenCalledTimes(1)
    expect(custom).toHaveBeenCalledTimes(1)
  })

  it('only lets a plugin register schemas its manifest declares', async () => {
    const { ctx, host } = await capture(['schemas'], { schemas: ['Quest'] })
    const { z } = ctx.schemas
    ctx.schemas.register('Quest', z.strictObject({ id: z.int(), title: z.string() }))
    expect(() => ctx.schemas.register('Sneaky', z.string())).toThrow(/not declared in the manifest/)
    expect(() => ctx.schemas.register('Quest', z.string())).toThrow(/already registered/)
    expect(host.schemas.names()).toEqual(['sandbox/Quest'])
  })

  it('validates data against registered plugin schemas, rejecting hallucinated fields', async () => {
    const { ctx } = await capture(['schemas'], { schemas: ['Quest'] })
    const { z } = ctx.schemas
    ctx.schemas.register('Quest', z.strictObject({ id: z.int(), title: z.string() }))
    expect(ctx.schemas.validate('sandbox/Quest', { id: 1, title: 'Find the sword' }).success).toBe(
      true,
    )
    expect(ctx.schemas.validate('sandbox/Quest', { id: 1, title: 'x', cheat: 1 }).success).toBe(
      false,
    )
    expect(ctx.schemas.validate('sandbox/Missing', {}).success).toBe(false)
    expect(ctx.schemas.has('sandbox/Quest')).toBe(true)
  })

  it('rejects registering something that is not a schema', async () => {
    const { ctx } = await capture(['schemas'], { schemas: ['Quest'] })
    expect(() => ctx.schemas.register('Quest', { not: 'a schema' } as never)).toThrow(
      /not a Zod schema/,
    )
  })

  it('serves host-specific capabilities only to plugins that declare them', async () => {
    interface WithStore extends CoreCapabilities {
      store: { dispatch: (action: string) => void }
    }
    const host = createCoreHost()
    const dispatch = vi.fn()
    const manager = createPluginManager<WithStore>({
      target: 'editor',
      host,
      providers: { ...createCoreCapabilityProviders(host), store: () => ({ dispatch }) },
    })
    manager.register({
      manifest: manifest('with-store', { capabilities: ['store'] }),
      module: { initialize: (ctx) => ctx.store.dispatch('hello') },
    })
    manager.register({
      manifest: manifest('without-store'),
      module: { initialize: (ctx) => expect(() => ctx.store).toThrow(CapabilityDeniedError) },
    })
    await manager.initialize()
    expect(dispatch).toHaveBeenCalledWith('hello')
  })
})

describe('loadPluginPackage', () => {
  const files = {
    'manifest.json': JSON.stringify(
      manifest('acme.pack', {
        entries: { shared: 'shared.js', editor: 'editor.js', engine: 'engine.js' },
        capabilities: ['events'],
      }),
    ),
    'shared.js': 'export default ({ z }) => ({ Thing: z.strictObject({ id: z.int() }) })',
    'editor.js': 'export default { initialize() {} } // editor-only',
    'engine.js': 'export default { initialize() {} } // engine-only',
  }

  const recordingImporter = (): {
    importer: ModuleImporter
    readonly imported: readonly string[]
  } => {
    const names = recorder<string>()
    return {
      get imported() {
        return names.values
      },
      importer: async (source, name) => {
        names.record(name)
        return importModuleFromSource(source, name)
      },
    }
  }

  it('imports real ES module source, handing the host Zod to shared entries', async () => {
    const registration = await loadPluginPackage(files, 'editor')
    expect(parsePluginManifest(files['manifest.json']).id).toBe('acme.pack')
    const shared = registration.shared as {
      Thing: { safeParse: (v: unknown) => { success: boolean } }
    }
    expect(shared.Thing.safeParse({ id: 1 }).success).toBe(true)
    expect(shared.Thing.safeParse({ id: 1, extra: true }).success).toBe(false)
    expect(registration.module).toHaveProperty('initialize')
  })

  it('never reads the editor entry when loading for the engine, and vice versa', async () => {
    const engine = recordingImporter()
    await loadPluginPackage(files, 'engine', { importModule: engine.importer })
    expect(engine.imported).toEqual(['shared.js', 'engine.js'])

    const editor = recordingImporter()
    await loadPluginPackage(files, 'editor', { importModule: editor.importer })
    expect(editor.imported).toEqual(['shared.js', 'editor.js'])
  })

  it('does not even require the other target entry to be present', async () => {
    const { 'editor.js': _editor, ...engineOnly } = files
    await expect(loadPluginPackage(engineOnly, 'engine')).resolves.toBeDefined()
    await expect(loadPluginPackage(engineOnly, 'editor')).rejects.toThrow(/editor\.js" is missing/)
  })

  it('supports plugins with only one head', async () => {
    const sharedOnly = {
      'manifest.json': JSON.stringify(manifest('acme.lib', { entries: { shared: 'shared.js' } })),
      'shared.js': 'export default { answer: 42 }',
    }
    const registration = await loadPluginPackage(sharedOnly, 'engine')
    expect(registration.shared).toEqual({ answer: 42 })
    expect(registration.module).toBeUndefined()
  })

  it('rejects bad manifests, missing files and modules without a valid default export', async () => {
    await expect(loadPluginPackage({}, 'editor')).rejects.toThrow(/manifest.json" is missing/)
    await expect(loadPluginPackage({ 'manifest.json': '{nope' }, 'editor')).rejects.toThrow(
      /not valid JSON/,
    )
    await expect(loadPluginPackage({ 'manifest.json': '{}' }, 'editor')).rejects.toThrow(
      /Invalid plugin manifest/,
    )
    await expect(
      loadPluginPackage({ ...files, 'editor.js': 'export const x = 1' }, 'editor'),
    ).rejects.toThrow(/no default export/)
    await expect(
      loadPluginPackage({ ...files, 'editor.js': 'export default 5' }, 'editor'),
    ).rejects.toThrow(/must be an object/)
    await expect(
      loadPluginPackage(
        { ...files, 'editor.js': 'export default { initialize: "nope" }' },
        'editor',
      ),
    ).rejects.toThrow(/must be an object/)
    await expect(
      loadPluginPackage({ ...files, 'editor.js': 'this is not javascript' }, 'editor'),
    ).rejects.toThrow(/Could not import/)
  })

  it('produces registrations the manager accepts end to end', async () => {
    const { manager } = setup()
    const pack = {
      'manifest.json': JSON.stringify(
        manifest('acme.live', { capabilities: ['log'], entries: { editor: 'editor.js' } }),
      ),
      'editor.js': "export default { initialize(ctx) { ctx.log.info('hello from a blob') } }",
    }
    const logs = recorder<LogEntry>()
    const host = createCoreHost(logs.record)
    const live = createPluginManager({
      target: 'editor',
      host,
      providers: createCoreCapabilityProviders(host),
    })
    live.register(await loadPluginPackage(pack, 'editor'))
    await live.initialize()
    expect(logs.values).toEqual([
      { level: 'info', pluginId: 'acme.live', message: 'hello from a blob', data: undefined },
    ])
    expect(manager.list()).toEqual([])
  })
})
