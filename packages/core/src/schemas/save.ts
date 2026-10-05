import { z } from 'zod'

import { DirectionSchema, IdSchema, NameSchema } from './common.ts'

/** JSON object keys are strings; ids are stored as their decimal form. */
const IdKeySchema = z.string().regex(/^[1-9]\d*$/, { error: 'Expected a positive integer id' })

export const SavedPartyMemberSchema = z.strictObject({
  actorId: IdSchema,
  level: z.int().min(1).max(99),
  experience: z.int().min(0),
  hp: z.int().min(0),
  mp: z.int().min(0),
})
export type SavedPartyMember = z.infer<typeof SavedPartyMemberSchema>

export const SavedEntitySchema = z.strictObject({
  eventId: IdSchema,
  x: z.int().min(0),
  y: z.int().min(0),
  direction: DirectionSchema,
})
export type SavedEntity = z.infer<typeof SavedEntitySchema>

export const SAVE_STATE_VERSION = 1

export const SaveStateSchema = z.strictObject({
  version: z.literal(SAVE_STATE_VERSION),
  projectName: NameSchema,
  /** Simulation ticks elapsed. */
  tick: z.int().min(0),
  /** Current state of the seeded RNG (uint32). */
  rngState: z.int().min(0).max(0xffff_ffff),
  mapId: IdSchema,
  player: z.strictObject({
    x: z.int().min(0),
    y: z.int().min(0),
    direction: DirectionSchema,
  }),
  entities: z.array(SavedEntitySchema),
  party: z.array(SavedPartyMemberSchema),
  switches: z.record(IdKeySchema, z.boolean()),
  variables: z.record(IdKeySchema, z.int()),
  inventory: z.record(IdKeySchema, z.int().min(1)),
  gold: z.int().min(0),
})
export type SaveState = z.infer<typeof SaveStateSchema>
