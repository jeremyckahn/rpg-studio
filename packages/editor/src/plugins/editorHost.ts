import { type Reducer, type UnknownAction } from '@reduxjs/toolkit'
import {
  type CapabilityProviders,
  type CoreCapabilities,
  type CoreHost,
  type JsonValue,
  type LogSink,
  type PluginManager,
  type Project,
  type Result,
  type Unsubscribe,
  ProjectActionSchema,
  createCoreCapabilityProviders,
  createCoreHost,
  createPluginManager,
  fail,
  ok,
} from '@rpgstudio/core'
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import * as React from 'react'
import { useDispatch, useSelector } from 'react-redux'

import { type AssetStore } from '../project/assetStore.ts'
import { type EditorStoreHandle, type RootState, applyProjectAction } from '../store/index.ts'
import { type PanelDefinition, type PanelRegistry } from './panelRegistry.ts'

/** What a plugin may do with the Redux store. */
export interface StoreCapability {
  /** The current project. Plugins never get the raw store. */
  getProject: () => Project
  /** Reads any part of the state. */
  select: <T>(selector: (state: RootState) => T) => T
  /**
   * Validates an untrusted project action against its Zod schema, checks that
   * it applies, and dispatches it. Returns the reason if it was refused.
   */
  dispatchProjectAction: (action: unknown) => Result<undefined>
  /** Adds a slice of the plugin's own state to the store. Idempotent per name. */
  registerSlice: <S>(options: PluginSliceOptions<S>) => PluginSlice<S>
  subscribe: (listener: () => void) => Unsubscribe
}

export interface PluginSliceOptions<S> {
  readonly name: string
  readonly initialState: S
  /** Each reducer returns the next state; none may mutate its argument. */
  readonly reducers: Readonly<Record<string, (state: S, payload: unknown) => S>>
}

export interface PluginSlice<S> {
  readonly actions: Readonly<
    Record<string, (payload?: unknown) => { type: string; payload: unknown }>
  >
  readonly select: (state: RootState) => S
}

/** The React and MUI pieces plugin modules use, since they cannot import them. */
export interface UiKit {
  readonly React: typeof React
  readonly mui: {
    readonly Alert: typeof Alert
    readonly Box: typeof Box
    readonly Button: typeof Button
    readonly Chip: typeof Chip
    readonly Divider: typeof Divider
    readonly IconButton: typeof IconButton
    readonly List: typeof List
    readonly ListItem: typeof ListItem
    readonly ListItemText: typeof ListItemText
    readonly Paper: typeof Paper
    readonly Stack: typeof Stack
    readonly TextField: typeof TextField
    readonly Tooltip: typeof Tooltip
    readonly Typography: typeof Typography
  }
  readonly hooks: {
    readonly useSelector: typeof useSelector
    readonly useDispatch: typeof useDispatch
  }
}

export interface UiCapability {
  readonly kit: UiKit
  /** Adds a panel to the editor. Removed automatically when the plugin is torn down. */
  registerPanel: (panel: PanelDefinition) => void
}

export interface FilesReadCapability {
  list: () => readonly string[]
  readText: (path: string) => string | undefined
  readBytes: (path: string) => Uint8Array | undefined
}

export interface FilesWriteCapability {
  write: (path: string, data: Uint8Array | string) => void
  remove: (path: string) => void
}

export interface EditorCapabilities extends CoreCapabilities {
  store: StoreCapability
  ui: UiCapability
  readFiles: FilesReadCapability
  writeFiles: FilesWriteCapability
}

export interface EditorHostOptions {
  readonly handle: EditorStoreHandle
  readonly assets: AssetStore
  readonly panels: PanelRegistry
  readonly logSink?: LogSink
}

export interface EditorPluginHost {
  readonly core: CoreHost
  readonly manager: PluginManager<EditorCapabilities>
}

const uiKit: UiKit = {
  React,
  mui: {
    Alert,
    Box,
    Button,
    Chip,
    Divider,
    IconButton,
    List,
    ListItem,
    ListItemText,
    Paper,
    Stack,
    TextField,
    Tooltip,
    Typography,
  },
  hooks: { useSelector, useDispatch },
}

/** Plugins may write images, audio and their own folder, never project data. */
const WRITABLE_ROOTS = ['img/', 'audio/'] as const

const canWrite = (pluginId: string, path: string): boolean =>
  WRITABLE_ROOTS.some((root) => path.startsWith(root)) || path.startsWith(`plugins/${pluginId}/`)

const sliceKey = (pluginId: string, name: string): string =>
  `plugin_${pluginId.replace(/[^a-z0-9]/gi, '_')}_${name}`

/**
 * Builds the editor's plugin manager. Beyond the core capabilities, plugins can
 * ask for `store`, `ui`, `files:read` and `files:write`, each narrowed so a
 * plugin cannot reach the raw store, overwrite project data, or write outside
 * the folders it is entitled to.
 */
export const createEditorPluginHost = ({
  handle,
  assets,
  panels,
  logSink,
}: EditorHostOptions): EditorPluginHost => {
  const core = createCoreHost(logSink)
  const { store } = handle
  let registered: ReadonlyMap<string, PluginSlice<unknown>> = new Map()

  const providers: CapabilityProviders<EditorCapabilities> = {
    ...createCoreCapabilityProviders(core),

    store: (scope) => ({
      getProject: () => store.getState().project.data,
      select: (selector) => selector(store.getState()),
      dispatchProjectAction: (input) => {
        const parsed = ProjectActionSchema.safeParse(input)
        if (!parsed.success) return fail(`Invalid action: ${parsed.error.message}`)
        const applied = applyProjectAction(store.getState().project.data, parsed.data)
        if (!applied.success) return applied
        store.dispatch(parsed.data)
        return ok(undefined)
      },
      registerSlice: <S>(options: PluginSliceOptions<S>): PluginSlice<S> => {
        const key = sliceKey(scope.manifest.id, options.name)
        const existing = registered.get(key)
        if (existing) return existing as PluginSlice<S>

        const prefix = `plugin/${scope.manifest.id}/${options.name}`
        const handlers = new Map(
          Object.entries(options.reducers).map(([name, reducer]) => [`${prefix}/${name}`, reducer]),
        )
        // A plain reducer: it is handed the previous state and returns the next.
        const reducer: Reducer<S, UnknownAction> = (state = options.initialState, action) => {
          const handler = handlers.get(action.type)
          return handler ? handler(state, (action as { payload?: unknown }).payload) : state
        }
        handle.injectReducer(key, reducer)
        const result: PluginSlice<S> = {
          actions: Object.fromEntries(
            Object.keys(options.reducers).map((name) => [
              name,
              (payload?: unknown) => ({ type: `${prefix}/${name}`, payload }),
            ]),
          ),
          select: (state) => (state as unknown as Record<string, S>)[key] as S,
        }
        registered = new Map(registered).set(key, result)
        return result
      },
      subscribe: (listener) => {
        const unsubscribe = store.subscribe(listener)
        scope.onDispose(unsubscribe)
        return unsubscribe
      },
    }),

    ui: (scope) => ({
      kit: uiKit,
      registerPanel: (panel) => {
        scope.onDispose(panels.register(panel))
      },
    }),

    readFiles: () => ({
      list: () => assets.list(),
      readText: (path) => assets.readText(path),
      readBytes: (path) => assets.readBytes(path),
    }),

    writeFiles: (scope) => ({
      write: (path, data) => {
        if (!canWrite(scope.manifest.id, path)) {
          throw new Error(`Plugin "${scope.manifest.id}" may not write ${path}`)
        }
        assets.write(path, data)
      },
      remove: (path) => {
        if (!canWrite(scope.manifest.id, path)) {
          throw new Error(`Plugin "${scope.manifest.id}" may not remove ${path}`)
        }
        assets.remove(path)
      },
    }),
  }

  return {
    core,
    manager: createPluginManager<EditorCapabilities>({ target: 'editor', host: core, providers }),
  }
}

/** Emits an editor-level event that plugins can hear through `ctx.events`. */
export const publishEditorEvent = (
  host: EditorPluginHost,
  name: string,
  payload: JsonValue,
): void => {
  host.core.bus.emit('custom', { name, payload })
}
