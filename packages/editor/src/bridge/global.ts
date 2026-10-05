import { type JsonValue, type Query, type Result, QuerySchema } from '@rpgstudio/core'

import { type EditorStoreHandle } from '../store/index.ts'
import { type AssetStore } from '../project/assetStore.ts'
import { type CompanionHandler } from './handler.ts'
import { runQuery } from './queries.ts'

/** What scripts running in the editor's page can call, e.g. from the browser console. */
export interface RPGStudioApi {
  readonly version: 1
  /** `RPGStudio.query({ type: 'GET_MAP_DATA', id: 1 })`. Throws with the reason on failure. */
  query: (query: unknown) => JsonValue
  /** Validates and applies a project action; returns why it was refused, if it was. */
  dispatch: (action: unknown) => Result<JsonValue>
}

export const createRPGStudioApi = (
  deps: { handle: EditorStoreHandle; assets: AssetStore },
  handler: CompanionHandler,
): RPGStudioApi => ({
  version: 1,
  query: (query) => {
    const parsed = QuerySchema.safeParse(query)
    if (!parsed.success)
      throw new Error(`Invalid query: ${parsed.error.issues[0]?.message ?? 'unknown'}`)
    const state = deps.handle.store.getState()
    const result = runQuery(
      { project: state.project.data, revision: state.project.revision, assets: deps.assets },
      parsed.data satisfies Query,
    )
    if (!result.success) throw new Error(result.error)
    return result.data
  },
  dispatch: (action) =>
    handler({ kind: 'action', id: `console-${Date.now().toString(36)}`, action }),
})

declare global {
  interface Window {
    RPGStudio?: RPGStudioApi
  }
}

export const installRPGStudioGlobal = (target: Window, api: RPGStudioApi): void => {
  Reflect.defineProperty(target, 'RPGStudio', { value: api, configurable: true, enumerable: false })
}
