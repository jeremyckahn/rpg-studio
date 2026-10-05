import { z } from 'zod'

import { PluginRegistrationError } from './errors.ts'
import { type PluginManifest, PluginManifestSchema, type PluginTarget } from './manifest.ts'
import { type PluginModule, type PluginRegistration } from './manager.ts'
import { type CoreCapabilities } from './context.ts'

/** A module namespace as produced by `import()`. */
export type ModuleNamespace = Readonly<Record<string, unknown>>

/**
 * Turns ES module source text into a module namespace. The default,
 * `importModuleFromSource`, uses a Blob object URL in browsers.
 */
export type ModuleImporter = (source: string, name: string) => Promise<ModuleNamespace>

export const importModuleFromSource: ModuleImporter = async (source, name) => {
  const importBlob = async (): Promise<ModuleNamespace> => {
    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }))
    try {
      return (await import(/* @vite-ignore */ url)) as ModuleNamespace
    } finally {
      URL.revokeObjectURL(url)
    }
  }
  const importDataUrl = async (): Promise<ModuleNamespace> =>
    (await import(
      /* @vite-ignore */ `data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`
    )) as ModuleNamespace

  try {
    // Blob URLs are the browser's mechanism. Headless hosts (Node, tests) cannot
    // import them, so those fall back to an equivalent data: URL.
    return typeof URL.createObjectURL === 'function'
      ? await importBlob().catch(importDataUrl)
      : await importDataUrl()
  } catch (error) {
    throw new PluginRegistrationError(`Could not import plugin module "${name}"`, { cause: error })
  }
}

/** What a `shared` entry receives, since a blob module cannot import `zod`. */
export interface SharedKit {
  readonly z: typeof z
}

/** The plugin directory as text files keyed by project-relative path. */
export type PluginFiles = Readonly<Record<string, string>>

export interface LoadPluginOptions {
  readonly importModule?: ModuleImporter
}

const defaultExport = (namespace: ModuleNamespace, name: string): unknown => {
  if (!('default' in namespace)) {
    throw new PluginRegistrationError(`Plugin module "${name}" has no default export`)
  }
  return namespace['default']
}

const isPluginModule = (value: unknown): value is PluginModule =>
  typeof value === 'object' &&
  value !== null &&
  (['onRegister', 'initialize', 'teardown'] as const).every((hook) => {
    const candidate = (value as Record<string, unknown>)[hook]
    return candidate === undefined || typeof candidate === 'function'
  })

const readFile = (files: PluginFiles, path: string): string => {
  const source = files[path]
  if (source === undefined) {
    throw new PluginRegistrationError(`Plugin file "${path}" is missing from the package`)
  }
  return source
}

export const parsePluginManifest = (json: string): PluginManifest => {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch (error) {
    throw new PluginRegistrationError('manifest.json is not valid JSON', { cause: error })
  }
  const parsed = PluginManifestSchema.safeParse(raw)
  if (!parsed.success) {
    throw new PluginRegistrationError(`Invalid plugin manifest: ${parsed.error.message}`, {
      cause: parsed.error,
    })
  }
  return parsed.data
}

/**
 * Loads a two-headed plugin for one target. The editor loads `shared` and
 * `editor`; the engine loads `shared` and `engine`. The other target's entry is
 * never read, so editor code cannot reach an exported game.
 */
export const loadPluginPackage = async <C extends object = CoreCapabilities>(
  files: PluginFiles,
  target: PluginTarget,
  options: LoadPluginOptions = {},
): Promise<PluginRegistration<C>> => {
  const importModule = options.importModule ?? importModuleFromSource
  const manifest = parsePluginManifest(readFile(files, 'manifest.json'))
  const { shared: sharedPath } = manifest.entries
  const targetPath = manifest.entries[target]

  const shared = sharedPath
    ? await (async () => {
        const exported = defaultExport(
          await importModule(readFile(files, sharedPath), sharedPath),
          sharedPath,
        )
        return typeof exported === 'function'
          ? (exported as (kit: SharedKit) => unknown)({ z })
          : exported
      })()
    : undefined

  const module = targetPath
    ? await (async () => {
        const exported = defaultExport(
          await importModule(readFile(files, targetPath), targetPath),
          targetPath,
        )
        if (!isPluginModule(exported)) {
          throw new PluginRegistrationError(
            `Default export of "${targetPath}" must be an object with optional onRegister/initialize/teardown functions`,
          )
        }
        return exported as PluginModule<C>
      })()
    : undefined

  return { manifest, shared, ...(module ? { module } : {}) }
}
