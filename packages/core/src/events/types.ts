import { type JsonValue } from '../json.ts'
import { type SaveState } from '../schemas/save.ts'

/** Events published on the shared bus by the core and by first-party systems. */
export interface CoreEventMap {
  'plugin:registered': { readonly pluginId: string }
  'plugin:initialized': { readonly pluginId: string }
  'plugin:teardown': { readonly pluginId: string }
  'plugin:failed': { readonly pluginId: string; readonly message: string }
  'schema:registered': { readonly pluginId: string; readonly name: string }
  'asset:changed': { readonly path: string }
  'game:saved': { readonly save: SaveState }
  'game:loaded': { readonly save: SaveState }
  /** Plugin-defined events travel here, namespaced `<pluginId>:<name>`. */
  custom: { readonly name: string; readonly payload: JsonValue }
}
