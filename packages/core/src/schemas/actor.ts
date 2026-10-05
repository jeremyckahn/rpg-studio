import { z } from 'zod'

import {
  AssetPathSchema,
  DescriptionSchema,
  ExtensionsSchema,
  IdSchema,
  NameSchema,
} from './common.ts'

export const StatsSchema = z.strictObject({
  maxHp: z.int().min(1).max(999_999),
  maxMp: z.int().min(0).max(999_999),
  attack: z.int().min(0).max(9_999),
  defense: z.int().min(0).max(9_999),
  magic: z.int().min(0).max(9_999),
  speed: z.int().min(0).max(9_999),
  luck: z.int().min(0).max(9_999),
})
export type Stats = z.infer<typeof StatsSchema>

/** Per-level stat growth. */
export const StatGrowthSchema = z.strictObject({
  maxHp: z.number().min(0).max(9_999),
  maxMp: z.number().min(0).max(9_999),
  attack: z.number().min(0).max(999),
  defense: z.number().min(0).max(999),
  magic: z.number().min(0).max(999),
  speed: z.number().min(0).max(999),
  luck: z.number().min(0).max(999),
})
export type StatGrowth = z.infer<typeof StatGrowthSchema>

export const SpriteSheetRefSchema = z.strictObject({
  sheet: AssetPathSchema,
  frameWidth: z.int().min(1).max(512),
  frameHeight: z.int().min(1).max(512),
})
export type SpriteSheetRef = z.infer<typeof SpriteSheetRefSchema>

export const ClassSchema = z.strictObject({
  id: IdSchema,
  name: NameSchema,
  description: DescriptionSchema.default(''),
  baseStats: StatsSchema,
  growth: StatGrowthSchema,
  learnings: z
    .array(z.strictObject({ level: z.int().min(1).max(99), skillId: IdSchema }))
    .default([]),
  extensions: ExtensionsSchema.optional(),
})
export type ActorClass = z.infer<typeof ClassSchema>

export const ActorSchema = z.strictObject({
  id: IdSchema,
  name: NameSchema,
  nickname: z.string().max(64).default(''),
  classId: IdSchema,
  initialLevel: z.int().min(1).max(99).default(1),
  maxLevel: z.int().min(1).max(99).default(99),
  description: DescriptionSchema.default(''),
  sprite: SpriteSheetRefSchema.optional(),
  face: AssetPathSchema.optional(),
  extensions: ExtensionsSchema.optional(),
})
export type Actor = z.infer<typeof ActorSchema>
