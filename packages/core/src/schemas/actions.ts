import { z } from 'zod'

import { ActorSchema, ClassSchema } from './actor.ts'
import { AssetPathSchema, IdSchema, NameSchema } from './common.ts'
import { MapEventSchema } from './event.ts'
import { EnemySchema, ItemSchema, SkillSchema } from './item.ts'
import { ProjectMetaSchema } from './project.ts'
import {
  MAX_COLLISION_FLAGS,
  MAX_LAYERS,
  MAX_MAP_DIMENSION,
  TileIdSchema,
  TileSizeSchema,
} from './tilemap.ts'

/**
 * The project-editing actions of the editor's Redux store, as serialisable
 * `{ type, payload }` objects. These schemas are the contract for everything
 * that changes a project: the UI dispatches them, and the companion bridge
 * validates untrusted AI input against them before it reaches the store.
 */

const MapIdSchema = IdSchema
const LayerIndexSchema = z
  .int()
  .min(0)
  .max(MAX_LAYERS - 1)
const CellCoordinate = z
  .int()
  .min(0)
  .max(MAX_MAP_DIMENSION - 1)

/** Undo/redo grouping: consecutive actions sharing a group undo as one step. */
const MetaSchema = z.strictObject({ historyGroup: z.string().min(1).max(64).optional() }).optional()

const action = <const T extends string, P extends z.ZodType>(type: T, payload: P) =>
  z.strictObject({ type: z.literal(type), payload, meta: MetaSchema })

const MAX_CELLS = MAX_MAP_DIMENSION * MAX_MAP_DIMENSION

export const SetTilesPayloadSchema = z.strictObject({
  mapId: MapIdSchema,
  layer: LayerIndexSchema,
  cells: z
    .array(z.strictObject({ x: CellCoordinate, y: CellCoordinate, tile: TileIdSchema }))
    .min(1)
    .max(MAX_CELLS),
})
export type SetTilesPayload = z.infer<typeof SetTilesPayloadSchema>

/** `MapEditor.fillArea(layer, tileId, startX, startY, endX, endY)` from the architecture document. */
export const FillAreaPayloadSchema = z.strictObject({
  mapId: MapIdSchema,
  layer: LayerIndexSchema,
  tile: TileIdSchema,
  startX: CellCoordinate,
  startY: CellCoordinate,
  endX: CellCoordinate,
  endY: CellCoordinate,
})
export type FillAreaPayload = z.infer<typeof FillAreaPayloadSchema>

export const FloodFillPayloadSchema = z.strictObject({
  mapId: MapIdSchema,
  layer: LayerIndexSchema,
  x: CellCoordinate,
  y: CellCoordinate,
  tile: TileIdSchema,
})
export type FloodFillPayload = z.infer<typeof FloodFillPayloadSchema>

export const SetCollisionPayloadSchema = z.strictObject({
  mapId: MapIdSchema,
  cells: z
    .array(
      z.strictObject({
        x: CellCoordinate,
        y: CellCoordinate,
        flags: z.int().min(0).max(MAX_COLLISION_FLAGS),
      }),
    )
    .min(1)
    .max(MAX_CELLS),
})
export type SetCollisionPayload = z.infer<typeof SetCollisionPayloadSchema>

export const CreateMapPayloadSchema = z.strictObject({
  /** Defaults to the next free id. */
  id: MapIdSchema.optional(),
  name: NameSchema,
  width: z.int().min(1).max(MAX_MAP_DIMENSION),
  height: z.int().min(1).max(MAX_MAP_DIMENSION),
  tileSize: TileSizeSchema.optional(),
  tileset: AssetPathSchema.optional(),
})
export type CreateMapPayload = z.infer<typeof CreateMapPayloadSchema>

export const ResizeMapPayloadSchema = z.strictObject({
  mapId: MapIdSchema,
  width: z.int().min(1).max(MAX_MAP_DIMENSION),
  height: z.int().min(1).max(MAX_MAP_DIMENSION),
})
export type ResizeMapPayload = z.infer<typeof ResizeMapPayloadSchema>

export const RenameMapPayloadSchema = z.strictObject({ mapId: MapIdSchema, name: NameSchema })
export type RenameMapPayload = z.infer<typeof RenameMapPayloadSchema>

export const DeleteMapPayloadSchema = z.strictObject({ mapId: MapIdSchema })
export type DeleteMapPayload = z.infer<typeof DeleteMapPayloadSchema>

export const AddLayerPayloadSchema = z.strictObject({ mapId: MapIdSchema, name: NameSchema })
export type AddLayerPayload = z.infer<typeof AddLayerPayloadSchema>

export const RemoveLayerPayloadSchema = z.strictObject({
  mapId: MapIdSchema,
  layer: LayerIndexSchema,
})
export type RemoveLayerPayload = z.infer<typeof RemoveLayerPayloadSchema>

export const SetLayerPropsPayloadSchema = z.strictObject({
  mapId: MapIdSchema,
  layer: LayerIndexSchema,
  name: NameSchema.optional(),
  visible: z.boolean().optional(),
  above: z.boolean().optional(),
})
export type SetLayerPropsPayload = z.infer<typeof SetLayerPropsPayloadSchema>

/** A database record, validated by the schema of the table it targets. */
export const UpsertRecordPayloadSchema = z.discriminatedUnion('table', [
  z.strictObject({ table: z.literal('actors'), record: ActorSchema }),
  z.strictObject({ table: z.literal('classes'), record: ClassSchema }),
  z.strictObject({ table: z.literal('items'), record: ItemSchema }),
  z.strictObject({ table: z.literal('skills'), record: SkillSchema }),
  z.strictObject({ table: z.literal('enemies'), record: EnemySchema }),
])
export type UpsertRecordPayload = z.infer<typeof UpsertRecordPayloadSchema>

export const DeleteRecordPayloadSchema = z.strictObject({
  table: z.enum(['actors', 'classes', 'items', 'skills', 'enemies']),
  id: IdSchema,
})
export type DeleteRecordPayload = z.infer<typeof DeleteRecordPayloadSchema>

export const UpsertMapEventPayloadSchema = z.strictObject({
  mapId: MapIdSchema,
  event: MapEventSchema,
})
export type UpsertMapEventPayload = z.infer<typeof UpsertMapEventPayloadSchema>

export const RemoveMapEventPayloadSchema = z.strictObject({
  mapId: MapIdSchema,
  eventId: IdSchema,
})
export type RemoveMapEventPayload = z.infer<typeof RemoveMapEventPayloadSchema>

export const UpdateMetaPayloadSchema = z.strictObject({
  changes: ProjectMetaSchema.omit({ format: true, formatVersion: true }).partial(),
})
export type UpdateMetaPayload = z.infer<typeof UpdateMetaPayloadSchema>

export const ProjectActionSchema = z.discriminatedUnion('type', [
  action('project/setTiles', SetTilesPayloadSchema),
  action('project/fillArea', FillAreaPayloadSchema),
  action('project/floodFill', FloodFillPayloadSchema),
  action('project/setCollision', SetCollisionPayloadSchema),
  action('project/createMap', CreateMapPayloadSchema),
  action('project/resizeMap', ResizeMapPayloadSchema),
  action('project/renameMap', RenameMapPayloadSchema),
  action('project/deleteMap', DeleteMapPayloadSchema),
  action('project/addLayer', AddLayerPayloadSchema),
  action('project/removeLayer', RemoveLayerPayloadSchema),
  action('project/setLayerProps', SetLayerPropsPayloadSchema),
  action('project/upsertRecord', UpsertRecordPayloadSchema),
  action('project/deleteRecord', DeleteRecordPayloadSchema),
  action('project/upsertMapEvent', UpsertMapEventPayloadSchema),
  action('project/removeMapEvent', RemoveMapEventPayloadSchema),
  action('project/updateMeta', UpdateMetaPayloadSchema),
])
export type ProjectAction = z.infer<typeof ProjectActionSchema>
export type ProjectActionType = ProjectAction['type']
