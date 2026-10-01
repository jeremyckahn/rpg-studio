import { z } from 'zod';

export const ItemEffectSchema = z.object({
  code: z.enum(['recover_hp', 'recover_mp', 'add_state', 'remove_state', 'buff', 'debuff']),
  value1: z.number(),
  value2: z.number().optional(),
});
export type ItemEffect = z.infer<typeof ItemEffectSchema>;

export const ItemSchema = z.object({
  id: z.union([z.string(), z.number()]),
  name: z.string().min(1),
  description: z.string().default(''),
  iconIndex: z.number().int().min(0).default(0),
  itemType: z.enum(['regular', 'key', 'consumable']),
  price: z.number().int().nonnegative().default(0),
  consumable: z.boolean().default(true),
  effects: z.array(ItemEffectSchema).default([]),
}).strict();
export type Item = z.infer<typeof ItemSchema>;

export const SkillDamageSchema = z.object({
  type: z.enum(['physical', 'magical', 'heal', 'none']),
  formula: z.string().min(1),
});
export type SkillDamage = z.infer<typeof SkillDamageSchema>;

export const SkillSchema = z.object({
  id: z.union([z.string(), z.number()]),
  name: z.string().min(1),
  description: z.string().default(''),
  iconIndex: z.number().int().min(0).default(0),
  mpCost: z.number().int().nonnegative().default(0),
  scope: z.enum(['one_enemy', 'all_enemies', 'one_ally', 'all_allies', 'user', 'none']),
  speed: z.number().int().default(0),
  damage: SkillDamageSchema,
  animationId: z.number().int().nonnegative().default(0),
}).strict();
export type Skill = z.infer<typeof SkillSchema>;
