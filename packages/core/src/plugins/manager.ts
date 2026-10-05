import { type CoreHost } from './capabilities.ts'
import {
  CAPABILITY_KEYS,
  type CapabilityKey,
  type CapabilityProviders,
  type CapabilityScope,
  type CoreCapabilities,
  type RPGStudioContext,
} from './context.ts'
import {
  CapabilityDeniedError,
  PluginDependencyError,
  PluginInitializationError,
  PluginRegistrationError,
} from './errors.ts'
import { type PluginManifest, PluginManifestSchema, type PluginTarget } from './manifest.ts'

/**
 * A plugin entry point's default export (`editor.ts` or `engine.ts`). Declared
 * with method syntax so that modules written against a specific shared type
 * remain assignable.
 */
export interface PluginModule<C extends object = CoreCapabilities, TShared = unknown> {
  /** Called synchronously when the manager accepts the plugin. */
  onRegister?(manifest: Readonly<PluginManifest>): void
  /** Called in dependency order. `shared` is the plugin's shared-entry export. */
  initialize?(context: RPGStudioContext<C>, shared: TShared): void | Promise<void>
  /** Called in reverse dependency order, before the context's disposers run. */
  teardown?(): void | Promise<void>
}

export interface PluginRegistration<C extends object = CoreCapabilities> {
  /** Untrusted `manifest.json` contents. Validated here. */
  readonly manifest: unknown
  readonly module?: PluginModule<C>
  readonly shared?: unknown
}

export type PluginState = 'registered' | 'initialized' | 'failed'

export interface PluginInfo {
  readonly manifest: Readonly<PluginManifest>
  readonly state: PluginState
}

export interface PluginManagerOptions<C extends object> {
  readonly target: PluginTarget
  readonly host: CoreHost
  /** Capability factories this host can serve, keyed by context property. */
  readonly providers: CapabilityProviders<C>
}

export interface PluginManager<C extends object = CoreCapabilities> {
  readonly target: PluginTarget
  /** Validates and records a plugin. Nothing runs until `initialize`. */
  register: (registration: PluginRegistration<C>) => PluginInfo
  /** Initialises every registered plugin in dependency order. */
  initialize: () => Promise<void>
  /** Tears initialised plugins down in reverse order, then lets them re-initialise. */
  teardown: () => Promise<void>
  unregister: (id: string) => void
  get: (id: string) => PluginInfo | undefined
  list: () => readonly PluginInfo[]
}

interface Entry<C extends object> {
  readonly manifest: Readonly<PluginManifest>
  readonly module: PluginModule<C> | undefined
  readonly shared: unknown
  readonly state: PluginState
  readonly disposers: Disposers
}

interface Disposers {
  readonly add: (dispose: () => void) => void
  /** Returns pending disposers in the order they must run, and clears them. */
  readonly drain: () => readonly (() => void)[]
}

const createDisposers = (): Disposers => {
  let pending: readonly (() => void)[] = []
  return {
    add: (dispose) => {
      pending = [...pending, dispose]
    },
    drain: () => {
      const current = pending.toReversed()
      pending = []
      return current
    },
  }
}

const deepFreeze = <T>(value: T): T => {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze)
    Object.freeze(value)
  }
  return value
}

const collectErrors = async (
  tasks: readonly (() => void | Promise<void>)[],
): Promise<readonly unknown[]> => {
  let errors: readonly unknown[] = []
  for (const task of tasks) {
    try {
      await task()
    } catch (error) {
      errors = [...errors, error]
    }
  }
  return errors
}

export const createPluginManager = <C extends object = CoreCapabilities>(
  options: PluginManagerOptions<C>,
): PluginManager<C> => {
  const { target, host, providers } = options
  let entries: ReadonlyMap<string, Entry<C>> = new Map()
  /** Plugin ids in the order they were initialised. */
  let initializedOrder: readonly string[] = []

  const setEntry = (id: string, entry: Entry<C>): void => {
    entries = new Map(entries).set(id, entry)
  }

  const requireEntry = (id: string): Entry<C> => {
    const entry = entries.get(id)
    if (!entry) throw new PluginDependencyError(`Plugin "${id}" is not registered`)
    return entry
  }

  const info = (entry: Entry<C>): PluginInfo => ({ manifest: entry.manifest, state: entry.state })

  const providerFor = (key: CapabilityKey): ((scope: CapabilityScope) => unknown) | undefined =>
    (providers as Readonly<Record<string, (scope: CapabilityScope) => unknown>>)[key]

  const buildContext = (entry: Entry<C>): RPGStudioContext<C> => {
    const { manifest } = entry
    const frozenManifest = deepFreeze(structuredClone(manifest))
    const scope: CapabilityScope = {
      manifest: frozenManifest,
      target,
      onDispose: entry.disposers.add,
    }
    const granted = new Set<string>(manifest.capabilities)

    const capabilityDescriptors = Object.entries(CAPABILITY_KEYS).map(([capability, key]) => {
      const instance = granted.has(capability) ? providerFor(key)?.(scope) : undefined
      return [
        key,
        {
          enumerable: true,
          get: (): unknown => {
            if (!granted.has(capability)) throw new CapabilityDeniedError(manifest.id, capability)
            return instance
          },
        },
      ] as const
    })

    const baseDescriptors = {
      pluginId: { enumerable: true, value: manifest.id },
      target: { enumerable: true, value: target },
      manifest: { enumerable: true, value: frozenManifest },
      onDispose: { enumerable: true, value: entry.disposers.add },
    }

    return Object.freeze(
      Object.create(null, {
        ...baseDescriptors,
        ...Object.fromEntries(capabilityDescriptors),
      }) as RPGStudioContext<C>,
    )
  }

  const register: PluginManager<C>['register'] = (registration) => {
    const parsed = PluginManifestSchema.safeParse(registration.manifest)
    if (!parsed.success) {
      throw new PluginRegistrationError(`Invalid plugin manifest: ${parsed.error.message}`, {
        cause: parsed.error,
      })
    }
    const manifest = parsed.data
    if (entries.has(manifest.id)) {
      throw new PluginRegistrationError(`Plugin "${manifest.id}" is already registered`)
    }
    const unavailable = manifest.capabilities.filter(
      (capability) => !providerFor(CAPABILITY_KEYS[capability]),
    )
    if (unavailable.length > 0) {
      throw new PluginRegistrationError(
        `Plugin "${manifest.id}" needs capabilities the ${target} host does not provide: ${unavailable.join(', ')}`,
      )
    }

    const entry: Entry<C> = {
      manifest,
      module: registration.module,
      shared: registration.shared,
      state: 'registered',
      disposers: createDisposers(),
    }
    registration.module?.onRegister?.(deepFreeze(structuredClone(manifest)))
    setEntry(manifest.id, entry)
    host.bus.emit('plugin:registered', { pluginId: manifest.id })
    return info(entry)
  }

  /** Dependencies first; registration order breaks ties. */
  const resolveOrder = (pending: readonly Entry<C>[]): readonly string[] => {
    const pendingIds = new Set(pending.map((entry) => entry.manifest.id))
    const visit = (
      id: string,
      order: readonly string[],
      path: readonly string[],
    ): readonly string[] => {
      if (order.includes(id)) return order
      if (path.includes(id)) {
        throw new PluginDependencyError(`Circular plugin dependency: ${[...path, id].join(' -> ')}`)
      }
      const entry = entries.get(id)
      if (!entry) {
        const dependent = path.at(-1) ?? id
        throw new PluginDependencyError(
          `Plugin "${dependent}" depends on "${id}", which is not registered`,
        )
      }
      const withDependencies = entry.manifest.dependencies.reduce(
        (acc, dependency) =>
          pendingIds.has(dependency) || !entries.has(dependency)
            ? visit(dependency, acc, [...path, id])
            : acc,
        order,
      )
      return [...withDependencies, id]
    }
    return pending.reduce(
      (order, entry) => visit(entry.manifest.id, order, []),
      [] as readonly string[],
    )
  }

  const teardownIds = async (ids: readonly string[]): Promise<readonly unknown[]> => {
    let errors: readonly unknown[] = []
    for (const id of ids.toReversed()) {
      const entry = entries.get(id)
      if (!entry) continue
      const taskErrors = await collectErrors([
        () => entry.module?.teardown?.(),
        ...entry.disposers.drain(),
      ])
      errors = [...errors, ...taskErrors]
      setEntry(id, { ...entry, state: 'registered' })
      initializedOrder = initializedOrder.filter((initialized) => initialized !== id)
      host.bus.emit('plugin:teardown', { pluginId: id })
    }
    return errors
  }

  const initialize: PluginManager<C>['initialize'] = async () => {
    const pending = [...entries.values()].filter((entry) => entry.state === 'registered')
    // Resolve the whole order first so a bad dependency graph initialises nothing.
    const order = resolveOrder(pending)
    let batch: readonly string[] = []
    for (const id of order) {
      const entry = requireEntry(id)
      if (entry.state !== 'registered') continue
      try {
        await entry.module?.initialize?.(buildContext(entry), entry.shared)
      } catch (error) {
        setEntry(id, { ...entry, state: 'failed' })
        host.bus.emit('plugin:failed', {
          pluginId: id,
          message: error instanceof Error ? error.message : String(error),
        })
        // Roll back what this call already initialised so no half-started state leaks.
        await teardownIds(batch)
        throw new PluginInitializationError(id, { cause: error })
      }
      setEntry(id, { ...entry, state: 'initialized' })
      initializedOrder = [...initializedOrder, id]
      batch = [...batch, id]
      host.bus.emit('plugin:initialized', { pluginId: id })
    }
  }

  const teardown: PluginManager<C>['teardown'] = async () => {
    const errors = await teardownIds(initializedOrder)
    if (errors.length > 0) {
      throw new AggregateError(errors, `${errors.length} plugin teardown step(s) failed`)
    }
  }

  const unregister: PluginManager<C>['unregister'] = (id) => {
    const entry = entries.get(id)
    if (!entry) return
    if (entry.state === 'initialized') {
      throw new PluginRegistrationError(
        `Plugin "${id}" is initialized; tear it down before unregistering`,
      )
    }
    entries = new Map([...entries].filter(([entryId]) => entryId !== id))
  }

  return {
    target,
    register,
    initialize,
    teardown,
    unregister,
    get: (id) => {
      const entry = entries.get(id)
      return entry && info(entry)
    },
    list: () => [...entries.values()].map(info),
  }
}
