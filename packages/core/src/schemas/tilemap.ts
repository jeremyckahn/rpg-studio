import { z } from 'zod';
import { MapEventSchema } from './event.js';

export const TileLayerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  visible: z.boolean().default(true),
  opacity: z.number().min(0).max(1).default(1),
  data: z.array(z.number().int()),
}).strict();
export type TileLayer = z.infer<typeof TileLayerSchema>;

export const TilemapSchema = z.object({
  id: z.union([z.string(), z.number()]),
  name: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  tileSize: z.number().int().positive().default(32),
  tilesetId: z.union([z.string(), z.number()]),
  layers: z.array(TileLayerSchema).min(1),
  collision: z.array(z.number().int()).default([]),
  events: z.array(MapEventSchema).default([]),
  parallaxImage: z.string().optional(),
  bgm: z.string().optional(),
  bgs: z.string().optional(),
}).strict().superRefine((val, ctx) => {
  const expectedLength = val.width * val.height;
  for (let i = 0; i < val.layers.length; i++) {
    const layer = val.layers[i];
    if (layer && layer.data.length !== expectedLength) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Layer "${layer.name}" data length (${layer.data.length}) must match map area width * height (${expectedLength})`,
        path: ['layers', i, 'data'],
      });
    }
  }
  if (val.collision.length > 0 && val.collision.length !== expectedLength) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Collision map length (${val.collision.length}) must match map area width * height (${expectedLength})`,
      path: ['collision'],
    });
  }
});
export type Tilemap = z.infer<typeof TilemapSchema>;
