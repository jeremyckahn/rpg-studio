import { z } from 'zod'

import { ProjectActionSchema } from './actions.ts'
import { ActorSchema, ClassSchema } from './actor.ts'
import { AssetPathSchema, IdSchema, PointSchema } from './common.ts'
import { EventCommandSchema, EventPageSchema, MapEventSchema } from './event.ts'
import { EnemySchema, ItemSchema, SkillSchema } from './item.ts'
import { ProjectSchema } from './project.ts'
import { TilemapSchema } from './tilemap.ts'
import { PixelMatrixSchema } from '../pixel/matrix.ts'

/**
 * The companion bridge wire protocol. An external agent (a script, a LangChain
 * program, a local model) talks to a relay server; the editor connects to the
 * same server as a client and executes what arrives. Everything is strict JSON,
 * and every shape below is validated on both ends.
 */
export const COMPANION_PROTOCOL_VERSION = 1

/** Default address of the local companion server, per the architecture document. */
export const DEFAULT_COMPANION_URL = 'ws://localhost:8080'

/** Largest message either side accepts. */
export const MAX_COMPANION_MESSAGE_BYTES = 16 * 1024 * 1024

const RequestIdSchema = z.string().min(1).max(64)

export const CompanionRoleSchema = z.enum(['editor', 'agent'])
export type CompanionRole = z.infer<typeof CompanionRoleSchema>

/** The first message every connection sends. */
export const HelloSchema = z.strictObject({
  kind: z.literal('hello'),
  protocol: z.literal(COMPANION_PROTOCOL_VERSION),
  role: CompanionRoleSchema,
  name: z.string().max(64).optional(),
  /** Shared secret, if the server was started with one. */
  token: z.string().max(256).optional(),
})
export type Hello = z.infer<typeof HelloSchema>

export const WelcomeSchema = z.strictObject({
  kind: z.literal('welcome'),
  protocol: z.literal(COMPANION_PROTOCOL_VERSION),
  role: CompanionRoleSchema,
  editorConnected: z.boolean(),
})

/** Sent to agents whenever the editor connects or disconnects. */
export const StatusSchema = z.strictObject({
  kind: z.literal('status'),
  editorConnected: z.boolean(),
})

/** Names an agent can pass to `GET_SCHEMA` to learn the shape of a model. */
export const SCHEMA_NAMES = [
  'project',
  'map',
  'actor',
  'class',
  'item',
  'skill',
  'enemy',
  'mapEvent',
  'eventPage',
  'eventCommand',
  'action',
  'pixelMatrix',
] as const
export type SchemaName = (typeof SCHEMA_NAMES)[number]

const SCHEMAS: Readonly<Record<SchemaName, z.ZodType>> = {
  project: ProjectSchema,
  map: TilemapSchema,
  actor: ActorSchema,
  class: ClassSchema,
  item: ItemSchema,
  skill: SkillSchema,
  enemy: EnemySchema,
  mapEvent: MapEventSchema,
  eventPage: EventPageSchema,
  eventCommand: EventCommandSchema,
  action: ProjectActionSchema,
  pixelMatrix: PixelMatrixSchema,
}

/** The Zod schema behind a `GET_SCHEMA` name, for validating generated data locally. */
export const schemaByName = (name: SchemaName): z.ZodType => SCHEMAS[name]

/** JSON Schema (draft 2020-12) of what a writer must send: defaults are optional. */
export const jsonSchemaFor = (name: SchemaName): unknown =>
  z.toJSONSchema(SCHEMAS[name], { io: 'input', unrepresentable: 'any', cycles: 'ref' })

/** Read-only questions an agent can ask the editor: `RPGStudio.query({ type: 'GET_MAP_DATA', id: 1 })`. */
export const QuerySchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('GET_PROJECT_SUMMARY') }),
  z.strictObject({ type: z.literal('GET_MAP_DATA'), id: IdSchema }),
  z.strictObject({
    type: z.literal('GET_TABLE'),
    table: z.enum(['actors', 'classes', 'items', 'skills', 'enemies']),
  }),
  z.strictObject({
    type: z.literal('GET_RECORD'),
    table: z.enum(['actors', 'classes', 'items', 'skills', 'enemies']),
    id: IdSchema,
  }),
  z.strictObject({ type: z.literal('GET_SCHEMA'), name: z.enum(SCHEMA_NAMES) }),
  z.strictObject({
    type: z.literal('FIND_PATH'),
    mapId: IdSchema,
    from: PointSchema,
    to: PointSchema,
  }),
  z.strictObject({ type: z.literal('LIST_ASSETS') }),
  z.strictObject({ type: z.literal('GET_PREVIEW_STATE') }),
])
export type Query = z.infer<typeof QuerySchema>

/** Bytes of an asset, base64 encoded. Roughly 12 MB of data. */
const Base64Schema = z
  .string()
  .max(16 * 1024 * 1024)
  .regex(/^[A-Za-z0-9+/]*={0,2}$/)

/** A request from an agent, relayed to the editor. */
export const AgentRequestSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('query'), id: RequestIdSchema, query: QuerySchema }),
  /** One serialised Redux action. Validated against `ProjectActionSchema` by the editor. */
  z.strictObject({ kind: z.literal('action'), id: RequestIdSchema, action: z.unknown() }),
  /** Several actions applied all-or-nothing and undone together. */
  z.strictObject({
    kind: z.literal('batch'),
    id: RequestIdSchema,
    actions: z.array(z.unknown()).min(1).max(1000),
  }),
  /** Writes a PNG or audio file into the project, which hot-reloads any texture showing it. */
  z.strictObject({
    kind: z.literal('writeAsset'),
    id: RequestIdSchema,
    path: AssetPathSchema,
    data: Base64Schema,
  }),
])
export type AgentRequest = z.infer<typeof AgentRequestSchema>

export const ResultSchema = z.discriminatedUnion('ok', [
  z.strictObject({
    kind: z.literal('result'),
    id: RequestIdSchema,
    ok: z.literal(true),
    result: z.json(),
  }),
  z.strictObject({
    kind: z.literal('result'),
    id: RequestIdSchema,
    ok: z.literal(false),
    error: z.string().max(4000),
  }),
])
export type CompanionResult = z.infer<typeof ResultSchema>

/** Everything an agent may send to the server. */
export const AgentToServerSchema = z.union([HelloSchema, AgentRequestSchema])
/** Everything the editor may send to the server. */
export const EditorToServerSchema = z.union([HelloSchema, ResultSchema])
/** Everything the server may send to an agent. */
export const ServerToAgentSchema = z.union([WelcomeSchema, StatusSchema, ResultSchema])
/** Everything the server may send to the editor. */
export const ServerToEditorSchema = z.union([WelcomeSchema, AgentRequestSchema])
