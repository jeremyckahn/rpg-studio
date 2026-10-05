import { z } from 'zod'

import { DirectionSchema, IdSchema } from './common.ts'
import { EventTriggerKindSchema } from './components.ts'
import { AssetPathSchema } from './common.ts'

/**
 * Semantic event commands. This is the representation AI agents and humans
 * write, e.g. `{ "command": "ShowText", "face": "Actor1", "text": "Hi" }`.
 * `events/compact.ts` translates to and from the compact runtime format.
 */

export const ConditionSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('switch'),
    switchId: IdSchema,
    equals: z.boolean().default(true),
  }),
  z.strictObject({
    type: z.literal('variable'),
    variableId: IdSchema,
    comparator: z.enum(['==', '!=', '>', '>=', '<', '<=']),
    value: z.int(),
  }),
])
export type Condition = z.infer<typeof ConditionSchema>

const volume = z.int().min(0).max(100).default(90)
const pitch = z.int().min(50).max(150).default(100)

const audioCommand = <const C extends string>(command: C) =>
  z.strictObject({
    command: z.literal(command),
    name: z.string().min(1).max(128),
    volume,
    pitch,
  })

export const EventCommandSchema = z.discriminatedUnion('command', [
  z.strictObject({
    command: z.literal('ShowText'),
    face: z.string().max(128).optional(),
    text: z.string().min(1).max(2000),
  }),
  z.strictObject({
    command: z.literal('TransferPlayer'),
    mapId: IdSchema,
    x: z.int().min(0),
    y: z.int().min(0),
    direction: DirectionSchema.optional(),
  }),
  z.strictObject({
    command: z.literal('SetSwitch'),
    switchId: IdSchema,
    value: z.boolean(),
  }),
  z.strictObject({
    command: z.literal('SetVariable'),
    variableId: IdSchema,
    operation: z.enum(['set', 'add', 'subtract', 'multiply']).default('set'),
    value: z.int(),
  }),
  audioCommand('PlaySE'),
  audioCommand('PlayBGM'),
  audioCommand('PlayBGS'),
  audioCommand('PlayME'),
  z.strictObject({
    command: z.literal('Wait'),
    frames: z.int().min(1).max(36_000),
  }),
  z.strictObject({
    command: z.literal('ConditionalBranch'),
    condition: ConditionSchema,
    get then() {
      return z.array(EventCommandSchema)
    },
    get else() {
      return z.array(EventCommandSchema).default([])
    },
  }),
])
export type EventCommand = z.infer<typeof EventCommandSchema>
export type EventCommandName = EventCommand['command']

export const EventGraphicSchema = z.strictObject({
  sheet: AssetPathSchema,
  frameWidth: z.int().min(1).max(512),
  frameHeight: z.int().min(1).max(512),
  frame: z.int().min(0),
})
export type EventGraphic = z.infer<typeof EventGraphicSchema>

export const EventPageSchema = z.strictObject({
  /** Every condition must hold for the page to be active. */
  conditions: z.array(ConditionSchema).default([]),
  trigger: EventTriggerKindSchema.default('action'),
  graphic: EventGraphicSchema.nullable().default(null),
  /** Solid events block movement. */
  solid: z.boolean().default(true),
  commands: z.array(EventCommandSchema).default([]),
})
export type EventPage = z.infer<typeof EventPageSchema>

export const MapEventSchema = z.strictObject({
  id: IdSchema,
  name: z.string().max(64).default(''),
  x: z.int().min(0),
  y: z.int().min(0),
  pages: z.array(EventPageSchema).min(1).max(32),
})
export type MapEvent = z.infer<typeof MapEventSchema>
