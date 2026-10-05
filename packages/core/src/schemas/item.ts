import { z } from 'zod'

import {
  AssetPathSchema,
  DescriptionSchema,
  ExtensionsSchema,
  IdSchema,
  NameSchema,
} from './common.ts'
import { SpriteSheetRefSchema, StatsSchema } from './actor.ts'

export const EffectSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('recoverHp'), value: z.int().min(0).max(999_999) }),
  z.strictObject({ type: z.literal('recoverMp'), value: z.int().min(0).max(999_999) }),
  z.strictObject({ type: z.literal('damageHp'), value: z.int().min(0).max(999_999) }),
])
export type Effect = z.infer<typeof EffectSchema>

export const TargetSchema = z.enum(['self', 'ally', 'allAllies', 'enemy', 'allEnemies'])
export type Target = z.infer<typeof TargetSchema>

export const ElementSchema = z.enum(['none', 'fire', 'ice', 'lightning', 'earth', 'light', 'dark'])
export type Element = z.infer<typeof ElementSchema>

export const ItemKindSchema = z.enum(['consumable', 'weapon', 'armor', 'key'])
export type ItemKind = z.infer<typeof ItemKindSchema>

export const ItemSchema = z.strictObject({
  id: IdSchema,
  name: NameSchema,
  description: DescriptionSchema.default(''),
  kind: ItemKindSchema,
  price: z.int().min(0).max(9_999_999).default(0),
  icon: AssetPathSchema.optional(),
  effects: z.array(EffectSchema).default([]),
  statBonuses: StatsSchema.partial().default({}),
  extensions: ExtensionsSchema.optional(),
})
export type Item = z.infer<typeof ItemSchema>

export const SkillSchema = z.strictObject({
  id: IdSchema,
  name: NameSchema,
  description: DescriptionSchema.default(''),
  mpCost: z.int().min(0).max(9_999).default(0),
  target: TargetSchema,
  element: ElementSchema.default('none'),
  effects: z.array(EffectSchema).default([]),
  extensions: ExtensionsSchema.optional(),
})
export type Skill = z.infer<typeof SkillSchema>

export const EnemySchema = z.strictObject({
  id: IdSchema,
  name: NameSchema,
  description: DescriptionSchema.default(''),
  stats: StatsSchema,
  sprite: SpriteSheetRefSchema.optional(),
  experience: z.int().min(0).max(9_999_999).default(0),
  gold: z.int().min(0).max(9_999_999).default(0),
  skillIds: z.array(IdSchema).default([]),
  drops: z
    .array(z.strictObject({ itemId: IdSchema, chance: z.number().min(0).max(1) }))
    .default([]),
  extensions: ExtensionsSchema.optional(),
})
export type Enemy = z.infer<typeof EnemySchema>
