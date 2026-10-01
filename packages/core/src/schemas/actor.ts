import { z } from 'zod';

export const StatsSchema = z.object({
  hp: z.number().int().min(0),
  maxHp: z.number().int().min(1),
  mp: z.number().int().min(0),
  maxMp: z.number().int().min(0),
  attack: z.number().int().min(0),
  defense: z.number().int().min(0),
  mAttack: z.number().int().min(0),
  mDefense: z.number().int().min(0),
  agility: z.number().int().min(0),
  luck: z.number().int().min(0),
});
export type Stats = z.infer<typeof StatsSchema>;

export const ActorEquipsSchema = z.object({
  weapon: z.union([z.string(), z.number()]).optional(),
  shield: z.union([z.string(), z.number()]).optional(),
  head: z.union([z.string(), z.number()]).optional(),
  body: z.union([z.string(), z.number()]).optional(),
  accessory: z.union([z.string(), z.number()]).optional(),
});
export type ActorEquips = z.infer<typeof ActorEquipsSchema>;

export const SpriteRefSchema = z.object({
  characterSheet: z.string().min(1),
  characterIndex: z.number().int().min(0),
  faceSheet: z.string().optional(),
  faceIndex: z.number().int().min(0).optional(),
});
export type SpriteRef = z.infer<typeof SpriteRefSchema>;

export const ActorSchema = z.object({
  id: z.union([z.string(), z.number()]),
  name: z.string().min(1),
  nickname: z.string().optional(),
  classId: z.union([z.string(), z.number()]),
  level: z.number().int().min(1),
  maxLevel: z.number().int().min(1).default(99),
  exp: z.number().int().min(0),
  stats: StatsSchema,
  equips: ActorEquipsSchema.default({}),
  sprite: SpriteRefSchema,
  profile: z.string().optional(),
}).strict();
export type Actor = z.infer<typeof ActorSchema>;

export const LearnableSkillSchema = z.object({
  level: z.number().int().min(1),
  skillId: z.union([z.string(), z.number()]),
});
export type LearnableSkill = z.infer<typeof LearnableSkillSchema>;

export const ClassSchema = z.object({
  id: z.union([z.string(), z.number()]),
  name: z.string().min(1),
  expCurve: z.object({
    base: z.number().positive(),
    multiplier: z.number().positive(),
  }),
  statGrowths: z.object({
    maxHp: z.number().positive(),
    maxMp: z.number().nonnegative(),
    attack: z.number().positive(),
    defense: z.number().positive(),
    mAttack: z.number().nonnegative(),
    mDefense: z.number().nonnegative(),
    agility: z.number().positive(),
    luck: z.number().nonnegative(),
  }),
  learnableSkills: z.array(LearnableSkillSchema).default([]),
}).strict();
export type Class = z.infer<typeof ClassSchema>;

export const DropItemSchema = z.object({
  itemId: z.union([z.string(), z.number()]),
  chance: z.number().min(0).max(1),
});
export type DropItem = z.infer<typeof DropItemSchema>;

export const EnemyActionSchema = z.object({
  skillId: z.union([z.string(), z.number()]),
  rating: z.number().int().min(1).max(10),
  condition: z.enum(['always', 'hp_low', 'mp_low', 'turn_count']),
});
export type EnemyAction = z.infer<typeof EnemyActionSchema>;

export const EnemySchema = z.object({
  id: z.union([z.string(), z.number()]),
  name: z.string().min(1),
  battlerName: z.string().min(1),
  stats: StatsSchema,
  expReward: z.number().int().nonnegative(),
  goldReward: z.number().int().nonnegative(),
  dropItems: z.array(DropItemSchema).default([]),
  actions: z.array(EnemyActionSchema).default([]),
}).strict();
export type Enemy = z.infer<typeof EnemySchema>;
