import { z } from 'zod'

import { AssetPathSchema, NameSchema } from '../schemas/common.ts'
import { PluginIdSchema } from '../schemas/project.ts'

export const GAME_BUNDLE_FORMAT = 'rpgstudio-game'
export const GAME_BUNDLE_FORMAT_VERSION = 1
/** Where the manifest lives in an exported game. */
export const GAME_BUNDLE_FILE = 'game.json'

/**
 * `game.json` is written into every exported game. Static hosts cannot list
 * directories, so the player reads this to learn which files to fetch.
 */
export const GameBundleSchema = z.strictObject({
  format: z.literal(GAME_BUNDLE_FORMAT),
  formatVersion: z.literal(GAME_BUNDLE_FORMAT_VERSION),
  name: NameSchema,
  /** Every project file shipped in the bundle (JSON data, maps, images, audio, plugins). */
  files: z.array(AssetPathSchema),
  /** Plugins whose engine entry the player must load. */
  plugins: z.array(PluginIdSchema).default([]),
})
export type GameBundle = z.infer<typeof GameBundleSchema>
