import { AssetPathSchema, type Unsubscribe, createEventBus } from '@rpgstudio/core'

export type AssetEvent =
  | { readonly type: 'changed'; readonly path: string }
  | { readonly type: 'removed'; readonly path: string }
  | { readonly type: 'reset' }

export type AssetData = Uint8Array | string

const encoder = new TextEncoder()
const decoder = new TextDecoder()

const toBytes = (data: AssetData): Uint8Array =>
  typeof data === 'string' ? encoder.encode(data) : data

/**
 * The files of the open project that are not JSON data: images, `.piskel`
 * sources, audio and plugin code. Bytes are kept here rather than in Redux
 * because they are not serialisable; the Redux `assets` slice mirrors only the
 * paths and versions. Changes are published as events and remembered until the
 * project is saved, so saving writes only what actually changed.
 */
export interface AssetStore {
  list: () => readonly string[]
  has: (path: string) => boolean
  readBytes: (path: string) => Uint8Array | undefined
  readText: (path: string) => string | undefined
  /** Adds or replaces a file. Throws if `path` is not a safe project-relative path. */
  write: (path: string, data: AssetData) => void
  remove: (path: string) => void
  /** Replaces every file at once (opening a project). Nothing is marked unsaved. */
  replaceAll: (files: Readonly<Record<string, Uint8Array>>) => void
  subscribe: (listener: (event: AssetEvent) => void) => Unsubscribe
  /** Files written since the last `markSaved`. */
  unsavedWrites: () => readonly string[]
  /** Files removed since the last `markSaved`. */
  unsavedRemovals: () => readonly string[]
  markSaved: () => void
}

export const createAssetStore = (): AssetStore => {
  let files: ReadonlyMap<string, Uint8Array> = new Map()
  let written: ReadonlySet<string> = new Set()
  let removed: ReadonlySet<string> = new Set()
  const bus = createEventBus<{ event: AssetEvent }>()

  const publish = (event: AssetEvent): void => {
    bus.emit('event', event)
  }

  return {
    list: () => [...files.keys()].toSorted(),
    has: (path) => files.has(path),
    readBytes: (path) => files.get(path),
    readText: (path) => {
      const bytes = files.get(path)
      return bytes === undefined ? undefined : decoder.decode(bytes)
    },
    write: (path, data) => {
      AssetPathSchema.parse(path)
      files = new Map(files).set(path, toBytes(data))
      written = new Set(written).add(path)
      removed = new Set([...removed].filter((candidate) => candidate !== path))
      publish({ type: 'changed', path })
    },
    remove: (path) => {
      if (!files.has(path)) return
      files = new Map([...files].filter(([candidate]) => candidate !== path))
      written = new Set([...written].filter((candidate) => candidate !== path))
      removed = new Set(removed).add(path)
      publish({ type: 'removed', path })
    },
    replaceAll: (next) => {
      files = new Map(Object.entries(next))
      written = new Set()
      removed = new Set()
      publish({ type: 'reset' })
    },
    subscribe: (listener) => bus.on('event', listener),
    unsavedWrites: () => [...written].toSorted(),
    unsavedRemovals: () => [...removed].toSorted(),
    markSaved: () => {
      written = new Set()
      removed = new Set()
    },
  }
}
