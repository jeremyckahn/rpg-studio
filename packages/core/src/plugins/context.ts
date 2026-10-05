import { type z } from 'zod'

import { type Unsubscribe } from '../events/bus.ts'
import { type CoreEventMap } from '../events/types.ts'
import { type JsonValue } from '../json.ts'
import { type Result } from '../result.ts'
import { type Capability, type PluginManifest, type PluginTarget } from './manifest.ts'

/** Context property that exposes each manifest capability. */
export const CAPABILITY_KEYS = {
  events: 'events',
  schemas: 'schemas',
  log: 'log',
  store: 'store',
  ui: 'ui',
  'files:read': 'readFiles',
  'files:write': 'writeFiles',
  ecs: 'ecs',
  render: 'render',
  audio: 'audio',
} as const satisfies Record<Capability, string>
export type CapabilityKey = (typeof CAPABILITY_KEYS)[Capability]

export interface Logger {
  debug: (message: string, data?: JsonValue) => void
  info: (message: string, data?: JsonValue) => void
  warn: (message: string, data?: JsonValue) => void
  error: (message: string, data?: JsonValue) => void
}

/** Plugin-facing view of the shared event bus. */
export interface ScopedEvents {
  /** Subscribes to an event published by the core or a first-party system. */
  on: <K extends keyof CoreEventMap>(
    type: K,
    handler: (payload: CoreEventMap[K]) => void,
  ) => Unsubscribe
  /** Publishes a plugin event, delivered as `<pluginId>:<name>`. */
  emit: (name: string, payload: JsonValue) => void
  /** Listens for plugin events by their full `<pluginId>:<name>`. */
  listen: (fullName: string, handler: (payload: JsonValue) => void) => Unsubscribe
}

/** Plugin-facing schema registry. */
export interface PluginSchemas {
  /** The host's Zod instance. Plugin modules cannot import `zod` themselves. */
  readonly z: typeof z
  /** Registers one of the schemas declared in the manifest. */
  register: (name: string, schema: z.ZodType) => void
  /** Validates `data` against a registered schema by its `<pluginId>/<name>`. */
  validate: (qualifiedName: string, data: unknown) => Result<unknown>
  has: (qualifiedName: string) => boolean
}

export interface CoreCapabilities {
  events: ScopedEvents
  schemas: PluginSchemas
  log: Logger
}

/** What a capability factory knows about the plugin it is serving. */
export interface CapabilityScope {
  readonly manifest: Readonly<PluginManifest>
  readonly target: PluginTarget
  /** Registers cleanup to run, last-in first-out, when the plugin is torn down. */
  readonly onDispose: (dispose: () => void) => void
}

export type CapabilityProviders<C extends object> = {
  readonly [K in keyof C & CapabilityKey]?: (scope: CapabilityScope) => C[K]
}

export interface PluginContextBase {
  readonly pluginId: string
  readonly target: PluginTarget
  readonly manifest: Readonly<PluginManifest>
  /** Registers cleanup to run when the plugin is torn down. */
  readonly onDispose: (dispose: () => void) => void
}

/**
 * The only object a plugin receives from the host. Every capability is a
 * getter: reading one the manifest did not declare throws
 * `CapabilityDeniedError`, so a plugin can never reach host internals by
 * accident or by design.
 */
export type RPGStudioContext<C extends object = CoreCapabilities> = PluginContextBase & Readonly<C>
