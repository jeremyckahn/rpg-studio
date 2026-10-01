import { z } from 'zod';
import {
  DirectionSchema,
  EventCommandSchema,
  EventPageSchema,
  EventTriggerSchema,
  type EventCommand,
  type EventPage,
  type EventTrigger,
} from '@rpgstudio/core';

export const PositionComponentSchema = z.object({
  x: z.number().int(),
  y: z.number().int(),
  pixelX: z.number().default(0),
  pixelY: z.number().default(0),
}).strict();
export type PositionComponent = z.infer<typeof PositionComponentSchema>;

export const MovementComponentSchema = z.object({
  targetX: z.number().int(),
  targetY: z.number().int(),
  speed: z.number().positive().default(4), // tiles per second or speed units
  moving: z.boolean().default(false),
  direction: DirectionSchema.default('down'),
}).strict();
export type MovementComponent = z.infer<typeof MovementComponentSchema>;

export const SpriteComponentSchema = z.object({
  textureKey: z.string().min(1),
  frame: z.number().int().min(0).default(0),
  visible: z.boolean().default(true),
  zIndex: z.number().default(0),
}).strict();
export type SpriteComponent = z.infer<typeof SpriteComponentSchema>;

export const CollisionComponentSchema = z.object({
  solid: z.boolean().default(true),
  collisionGroup: z.string().default('default'),
}).strict();
export type CollisionComponent = z.infer<typeof CollisionComponentSchema>;

export const EventTriggerComponentSchema = z.object({
  eventId: z.number().int().positive(),
  trigger: EventTriggerSchema.default('action_button'),
  pages: z.array(EventPageSchema).default([]),
  activePageIndex: z.number().int().min(0).default(0),
  commandQueue: z.array(EventCommandSchema).default([]),
  commandIndex: z.number().int().min(0).default(0),
  waitFrames: z.number().int().min(0).default(0),
  active: z.boolean().default(false),
}).strict();
export type EventTriggerComponent = {
  eventId: number;
  trigger: EventTrigger;
  pages: readonly EventPage[];
  activePageIndex: number;
  commandQueue: readonly EventCommand[];
  commandIndex: number;
  waitFrames: number;
  active: boolean;
};

export const PlayerTagComponentSchema = z.object({
  actorId: z.union([z.string(), z.number()]),
}).strict();
export type PlayerTagComponent = z.infer<typeof PlayerTagComponentSchema>;

export interface GameEntity {
  id?: number | string;
  position?: PositionComponent;
  movement?: MovementComponent;
  sprite?: SpriteComponent;
  collision?: CollisionComponent;
  eventTrigger?: EventTriggerComponent;
  playerTag?: PlayerTagComponent;
}
