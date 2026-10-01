import { z } from 'zod';

export const DirectionSchema = z.enum(['down', 'left', 'right', 'up']);
export type Direction = z.infer<typeof DirectionSchema>;

export const EventTriggerSchema = z.enum([
  'action_button',
  'player_touch',
  'event_touch',
  'autorun',
  'parallel',
]);
export type EventTrigger = z.infer<typeof EventTriggerSchema>;

export const ShowTextCommandSchema = z.object({
  command: z.literal('ShowText'),
  face: z.string().optional(),
  faceIndex: z.number().int().min(0).optional(),
  speakerName: z.string().optional(),
  text: z.string(),
}).strict();
export type ShowTextCommand = z.infer<typeof ShowTextCommandSchema>;

export const TransferPlayerCommandSchema = z.object({
  command: z.literal('TransferPlayer'),
  mapId: z.union([z.string(), z.number()]),
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  direction: DirectionSchema.optional(),
}).strict();
export type TransferPlayerCommand = z.infer<typeof TransferPlayerCommandSchema>;

export const SetSwitchCommandSchema = z.object({
  command: z.literal('SetSwitch'),
  switchId: z.union([z.string(), z.number()]),
  value: z.boolean(),
}).strict();
export type SetSwitchCommand = z.infer<typeof SetSwitchCommandSchema>;

export const SetVariableCommandSchema = z.object({
  command: z.literal('SetVariable'),
  variableId: z.union([z.string(), z.number()]),
  operation: z.enum(['set', 'add', 'sub', 'mul', 'div', 'mod']),
  value: z.number(),
}).strict();
export type SetVariableCommand = z.infer<typeof SetVariableCommandSchema>;

export const PlaySECommandSchema = z.object({
  command: z.literal('PlaySE'),
  name: z.string().min(1),
  volume: z.number().min(0).max(100).default(100),
  pitch: z.number().min(50).max(150).default(100),
  pan: z.number().min(-100).max(100).default(0),
}).strict();
export type PlaySECommand = z.infer<typeof PlaySECommandSchema>;

export const PlayBGMCommandSchema = z.object({
  command: z.literal('PlayBGM'),
  name: z.string().min(1),
  volume: z.number().min(0).max(100).default(100),
  pitch: z.number().min(50).max(150).default(100),
}).strict();
export type PlayBGMCommand = z.infer<typeof PlayBGMCommandSchema>;

export const WaitCommandSchema = z.object({
  command: z.literal('Wait'),
  frames: z.number().int().positive(),
}).strict();
export type WaitCommand = z.infer<typeof WaitCommandSchema>;

// Base command union without recursive ConditionalBranch
export const LeafEventCommandSchema = z.discriminatedUnion('command', [
  ShowTextCommandSchema,
  TransferPlayerCommandSchema,
  SetSwitchCommandSchema,
  SetVariableCommandSchema,
  PlaySECommandSchema,
  PlayBGMCommandSchema,
  WaitCommandSchema,
]);
export type LeafEventCommand = z.infer<typeof LeafEventCommandSchema>;
export type LeafEventCommandInput = z.input<typeof LeafEventCommandSchema>;

export type ConditionalBranchCommand = {
  readonly command: 'ConditionalBranch';
  readonly condition: {
    readonly type: 'switch' | 'variable';
    readonly id: string | number;
    readonly op?: '==' | '!=' | '>=' | '<=' | '>' | '<';
    readonly value: boolean | number;
  };
  readonly thenCommands: readonly EventCommand[];
  readonly elseCommands?: readonly EventCommand[];
};

export type ConditionalBranchCommandInput = {
  readonly command: 'ConditionalBranch';
  readonly condition: {
    readonly type: 'switch' | 'variable';
    readonly id: string | number;
    readonly op?: '==' | '!=' | '>=' | '<=' | '>' | '<';
    readonly value: boolean | number;
  };
  readonly thenCommands: readonly EventCommandInput[];
  readonly elseCommands?: readonly EventCommandInput[];
};

export type EventCommand = LeafEventCommand | ConditionalBranchCommand;
export type EventCommandInput = LeafEventCommandInput | ConditionalBranchCommandInput;

// Recursive EventCommand supporting nested branches
export const EventCommandSchema: z.ZodType<EventCommand, z.ZodTypeDef, EventCommandInput> = z.lazy(() =>
  z.union([
    LeafEventCommandSchema,
    z.object({
      command: z.literal('ConditionalBranch'),
      condition: z.object({
        type: z.enum(['switch', 'variable']),
        id: z.union([z.string(), z.number()]),
        op: z.enum(['==', '!=', '>=', '<=', '>', '<']).optional(),
        value: z.union([z.boolean(), z.number()]),
      }),
      thenCommands: z.array(EventCommandSchema),
      elseCommands: z.array(EventCommandSchema).optional(),
    }).strict(),
  ])
);

export const EventPageConditionsSchema = z.object({
  switch1Id: z.union([z.string(), z.number()]).optional(),
  switch2Id: z.union([z.string(), z.number()]).optional(),
  variableId: z.union([z.string(), z.number()]).optional(),
  variableValue: z.number().optional(),
}).strict();
export type EventPageConditions = z.infer<typeof EventPageConditionsSchema>;

export const EventPageGraphicSchema = z.object({
  characterSheet: z.string().optional(),
  characterIndex: z.number().int().min(0).optional(),
  direction: DirectionSchema.optional(),
  pattern: z.number().int().min(0).max(3).optional(),
}).strict();
export type EventPageGraphic = z.infer<typeof EventPageGraphicSchema>;

export const EventPageSchema = z.object({
  id: z.number().int().min(1).default(1),
  conditions: EventPageConditionsSchema.default({}),
  graphic: EventPageGraphicSchema.default({}),
  trigger: EventTriggerSchema.default('action_button'),
  list: z.array(EventCommandSchema).default([]),
}).strict();
export type EventPage = z.infer<typeof EventPageSchema>;

export const MapEventSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  pages: z.array(EventPageSchema).min(1),
}).strict();
export type MapEvent = z.infer<typeof MapEventSchema>;
