import { z } from 'zod'

import { AssetPathSchema, DirectionSchema, IdSchema, PointSchema } from './common.ts'

/**
 * ECS component schemas. The engine's miniplex world holds plain objects typed
 * from these schemas; `safeParse` runs only at data boundaries (map load, save
 * restore, plugin and AI input), never inside a tick.
 */

/** Tile coordinates of an entity's logical position. */
export const PositionComponent = PointSchema
export type Position = z.infer<typeof PositionComponent>

export const MovementComponent = z.strictObject({
  direction: DirectionSchema,
  /** Tiles travelled per second. */
  speed: z.number().positive().max(32),
  /** Direction requested for the next step, consumed when a step can begin. */
  intent: DirectionSchema.nullable(),
  /** Destination tile of the step in flight, or null while idle. */
  target: PointSchema.nullable(),
  /** Fraction (0..1) of the step in flight that has been completed. */
  progress: z.number().min(0).max(1),
})
export type Movement = z.infer<typeof MovementComponent>

export const SpriteComponent = z.strictObject({
  sheet: AssetPathSchema,
  frameWidth: z.int().min(1).max(512),
  frameHeight: z.int().min(1).max(512),
  frame: z.int().min(0),
})
export type SpriteData = z.infer<typeof SpriteComponent>

export const CollisionComponent = z.strictObject({ solid: z.boolean() })
export type Collision = z.infer<typeof CollisionComponent>

export const EventTriggerKindSchema = z.enum(['action', 'touch', 'autorun', 'parallel'])
export type EventTriggerKind = z.infer<typeof EventTriggerKindSchema>

export const EventTriggerComponent = z.strictObject({
  eventId: IdSchema,
  trigger: EventTriggerKindSchema,
})
export type EventTrigger = z.infer<typeof EventTriggerComponent>
