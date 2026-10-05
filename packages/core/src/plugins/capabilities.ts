import { z } from 'zod'

import { type EventBus } from '../events/bus.ts'
import { createEventBus } from '../events/bus.ts'
import { type CoreEventMap } from '../events/types.ts'
import { type JsonValue } from '../json.ts'
import { fail, ok } from '../result.ts'
import {
  type CapabilityProviders,
  type CoreCapabilities,
  type Logger,
  type PluginSchemas,
} from './context.ts'
import { PluginPolicyError } from './errors.ts'

const CUSTOM_EVENT_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/

export interface SchemaRegistry {
  register: (pluginId: string, name: string, schema: z.ZodType) => void
  validate: (qualifiedName: string, data: unknown) => ReturnType<PluginSchemas['validate']>
  has: (qualifiedName: string) => boolean
  names: () => string[]
}

export const createSchemaRegistry = (bus: EventBus<CoreEventMap>): SchemaRegistry => {
  let schemas: ReadonlyMap<string, z.ZodType> = new Map()
  return {
    register: (pluginId, name, schema) => {
      const qualified = `${pluginId}/${name}`
      if (schemas.has(qualified)) {
        throw new PluginPolicyError(pluginId, `schema "${name}" is already registered`)
      }
      if (typeof (schema as Partial<z.ZodType>).safeParse !== 'function') {
        throw new PluginPolicyError(pluginId, `"${name}" is not a Zod schema`)
      }
      schemas = new Map(schemas).set(qualified, schema)
      bus.emit('schema:registered', { pluginId, name: qualified })
    },
    validate: (qualifiedName, data) => {
      const schema = schemas.get(qualifiedName)
      if (!schema) return fail(`No schema registered as "${qualifiedName}"`)
      const parsed = schema.safeParse(data)
      return parsed.success ? ok(parsed.data) : fail(parsed.error.message)
    },
    has: (qualifiedName) => schemas.has(qualifiedName),
    names: () => [...schemas.keys()],
  }
}

export interface LogEntry {
  readonly level: 'debug' | 'info' | 'warn' | 'error'
  readonly pluginId: string
  readonly message: string
  readonly data?: JsonValue | undefined
}

export type LogSink = (entry: LogEntry) => void

export interface CoreHost {
  readonly bus: EventBus<CoreEventMap>
  readonly schemas: SchemaRegistry
  readonly logSink: LogSink
}

export const createCoreHost = (logSink: LogSink = () => undefined): CoreHost => {
  const bus = createEventBus<CoreEventMap>()
  return { bus, schemas: createSchemaRegistry(bus), logSink }
}

/** Capability factories for `events`, `schemas` and `log`, shared by every host. */
export const createCoreCapabilityProviders = (
  host: CoreHost,
): CapabilityProviders<CoreCapabilities> => ({
  events: (scope) => {
    const pluginId = scope.manifest.id
    return {
      on: (type, handler) => {
        const unsubscribe = host.bus.on(type, handler)
        scope.onDispose(unsubscribe)
        return unsubscribe
      },
      emit: (name, payload) => {
        if (!CUSTOM_EVENT_NAME.test(name)) {
          throw new PluginPolicyError(pluginId, `invalid event name "${name}"`)
        }
        const checked = z.json().safeParse(payload)
        if (!checked.success) {
          throw new PluginPolicyError(pluginId, `payload of event "${name}" is not strict JSON`)
        }
        host.bus.emit('custom', { name: `${pluginId}:${name}`, payload: checked.data })
      },
      listen: (fullName, handler) => {
        const unsubscribe = host.bus.on('custom', (event) => {
          if (event.name === fullName) handler(event.payload)
        })
        scope.onDispose(unsubscribe)
        return unsubscribe
      },
    }
  },
  schemas: (scope) => {
    const pluginId = scope.manifest.id
    return {
      z,
      register: (name, schema) => {
        if (!scope.manifest.schemas.includes(name)) {
          throw new PluginPolicyError(pluginId, `schema "${name}" is not declared in the manifest`)
        }
        host.schemas.register(pluginId, name, schema)
      },
      validate: host.schemas.validate,
      has: host.schemas.has,
    }
  },
  log: (scope) => {
    const pluginId = scope.manifest.id
    const write =
      (level: LogEntry['level']): Logger[LogEntry['level']] =>
      (message, data) => {
        host.logSink({ level, pluginId, message, data })
      }
    return {
      debug: write('debug'),
      info: write('info'),
      warn: write('warn'),
      error: write('error'),
    }
  },
})
