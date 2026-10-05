import { z } from 'zod'

import { AssetPathSchema, ExtensionsSchema, IdSchema, NameSchema, hasUniqueIds } from './common.ts'
import { MapEventSchema } from './event.ts'
import { type ValidationIssue, issuesCheck } from './refine.ts'

/**
 * Per-cell collision bit flags. `SOLID` blocks the cell entirely; the
 * directional flags block crossing a cell edge, which allows one-way ledges.
 */
export const CollisionFlags = {
  PASSABLE: 0,
  SOLID: 1,
  BLOCK_UP: 2,
  BLOCK_DOWN: 4,
  BLOCK_LEFT: 8,
  BLOCK_RIGHT: 16,
} as const
export const MAX_COLLISION_FLAGS = 31

export const SUPPORTED_TILE_SIZES = [16, 24, 32, 48] as const
export const TileSizeSchema = z.union([z.literal(16), z.literal(24), z.literal(32), z.literal(48)])
export type TileSize = z.infer<typeof TileSizeSchema>

export const MAX_MAP_DIMENSION = 512
export const MAX_LAYERS = 8

/** Tile id 0 is empty; id `n > 0` selects tileset cell `n - 1` (row-major). */
export const TileIdSchema = z.int().min(0).max(1_048_575)

export const TilemapLayerSchema = z.strictObject({
  name: NameSchema,
  visible: z.boolean().default(true),
  /** Row-major tile ids, `width * height` entries. */
  data: z.array(TileIdSchema),
})
export type TilemapLayer = z.infer<typeof TilemapLayerSchema>

export const AudioRefSchema = z.strictObject({
  name: z.string().min(1).max(128),
  volume: z.int().min(0).max(100).default(90),
  pitch: z.int().min(50).max(150).default(100),
})
export type AudioRef = z.infer<typeof AudioRefSchema>

const TilemapShapeSchema = z.strictObject({
  id: IdSchema,
  name: NameSchema,
  width: z.int().min(1).max(MAX_MAP_DIMENSION),
  height: z.int().min(1).max(MAX_MAP_DIMENSION),
  tileSize: TileSizeSchema,
  tileset: AssetPathSchema,
  layers: z.array(TilemapLayerSchema).min(1).max(MAX_LAYERS),
  /** Row-major collision bit flags, `width * height` entries. */
  collision: z.array(z.int().min(0).max(MAX_COLLISION_FLAGS)),
  events: z.array(MapEventSchema).default([]),
  bgm: AudioRefSchema.optional(),
  bgs: AudioRefSchema.optional(),
  extensions: ExtensionsSchema.optional(),
})

export type Tilemap = z.infer<typeof TilemapShapeSchema>

const validateTilemap = (map: Tilemap): ValidationIssue[] => {
  const cells = map.width * map.height
  return [
    ...map.layers.flatMap((layer, index) =>
      layer.data.length === cells
        ? []
        : [
            {
              path: ['layers', index, 'data'],
              message: `Layer "${layer.name}" has ${layer.data.length} tiles but the map has ${cells} cells`,
            },
          ],
    ),
    ...(map.collision.length === cells
      ? []
      : [
          {
            path: ['collision'],
            message: `Collision has ${map.collision.length} entries but the map has ${cells} cells`,
          },
        ]),
    ...(hasUniqueIds(map.events)
      ? []
      : [{ path: ['events'], message: 'Map events must have unique ids' }]),
    ...map.events.flatMap((event, index) =>
      event.x < map.width && event.y < map.height
        ? []
        : [
            {
              path: ['events', index],
              message: `Event ${event.id} lies outside the ${map.width}x${map.height} map`,
            },
          ],
    ),
  ]
}

export const TilemapSchema = TilemapShapeSchema.check(issuesCheck(validateTilemap))
