import { z } from 'zod';
import { ActorSchema } from './actor.js';
import { DirectionSchema } from './event.js';

export const SavePlayerEntitySchema = z.object({
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  direction: DirectionSchema.default('down'),
  actorId: z.union([z.string(), z.number()]),
}).strict();
export type SavePlayerEntity = z.infer<typeof SavePlayerEntitySchema>;

export const InventoryItemSchema = z.object({
  itemId: z.union([z.string(), z.number()]),
  count: z.number().int().positive(),
}).strict();
export type InventoryItem = z.infer<typeof InventoryItemSchema>;

export const SaveStateSchema = z.object({
  version: z.string().min(1),
  timestamp: z.number().int().positive(),
  playTime: z.number().int().nonnegative().default(0),
  mapId: z.union([z.string(), z.number()]),
  player: SavePlayerEntitySchema,
  actors: z.array(ActorSchema).min(1),
  switches: z.record(z.string(), z.boolean()).default({}),
  variables: z.record(z.string(), z.number()).default({}),
  selfSwitches: z.record(z.string(), z.boolean()).default({}),
  inventory: z.array(InventoryItemSchema).default([]),
  gold: z.number().int().nonnegative().default(0),
}).strict();
export type SaveState = z.infer<typeof SaveStateSchema>;
