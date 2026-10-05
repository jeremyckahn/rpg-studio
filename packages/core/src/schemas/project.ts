import { z } from 'zod'

import { flattenCommands } from '../events/walk.ts'
import { ActorSchema, ClassSchema } from './actor.ts'
import { DirectionSchema, IdSchema, NameSchema, hasUniqueIds } from './common.ts'
import { EnemySchema, ItemSchema, SkillSchema } from './item.ts'
import { type ValidationIssue, issuesCheck } from './refine.ts'
import { TilemapSchema } from './tilemap.ts'

export const PROJECT_FORMAT = 'rpgstudio-project'
export const PROJECT_FORMAT_VERSION = 1

/** Plugin ids are lowercase dotted/dashed identifiers, e.g. `acme.quest-log`. */
export const PluginIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)*$/, {
    error: 'Plugin ids are lowercase, dot-separated and may contain dashes',
  })

const IdKeySchema = z.string().regex(/^[1-9]\d*$/)

export const ProjectMetaSchema = z.strictObject({
  format: z.literal(PROJECT_FORMAT),
  formatVersion: z.literal(PROJECT_FORMAT_VERSION),
  name: NameSchema,
  startMapId: IdSchema,
  startX: z.int().min(0),
  startY: z.int().min(0),
  startDirection: DirectionSchema.default('down'),
  /** Actor ids in the starting party. */
  startParty: z.array(IdSchema).default([]),
  startGold: z.int().min(0).default(0),
  /** Ids of the plugins living in `/plugins/<id>/`. */
  plugins: z.array(PluginIdSchema).default([]),
  switchNames: z.record(IdKeySchema, z.string().max(64)).default({}),
  variableNames: z.record(IdKeySchema, z.string().max(64)).default({}),
})
export type ProjectMeta = z.infer<typeof ProjectMetaSchema>

const DatabaseShapeSchema = z.strictObject({
  actors: z.array(ActorSchema).default([]),
  classes: z.array(ClassSchema).default([]),
  items: z.array(ItemSchema).default([]),
  skills: z.array(SkillSchema).default([]),
  enemies: z.array(EnemySchema).default([]),
})

export const DatabaseSchema = DatabaseShapeSchema.check(
  issuesCheck((db: z.infer<typeof DatabaseShapeSchema>): ValidationIssue[] =>
    (Object.entries(db) as [string, readonly { readonly id: number }[]][]).flatMap(
      ([table, rows]) =>
        hasUniqueIds(rows)
          ? []
          : [{ path: [table], message: `Records in "${table}" must have unique ids` }],
    ),
  ),
)
export type Database = z.infer<typeof DatabaseSchema>

export type DatabaseTableName = keyof Database

export const DATABASE_TABLES = [
  'actors',
  'classes',
  'items',
  'skills',
  'enemies',
] as const satisfies readonly DatabaseTableName[]

export const DATABASE_RECORD_SCHEMAS = {
  actors: ActorSchema,
  classes: ClassSchema,
  items: ItemSchema,
  skills: SkillSchema,
  enemies: EnemySchema,
} as const

const ProjectShapeSchema = z.strictObject({
  meta: ProjectMetaSchema,
  database: DatabaseSchema,
  maps: z.array(TilemapSchema),
})

const validateProject = ({
  meta,
  database,
  maps,
}: z.infer<typeof ProjectShapeSchema>): ValidationIssue[] => {
  const classIds = new Set(database.classes.map((c) => c.id))
  const skillIds = new Set(database.skills.map((s) => s.id))
  const itemIds = new Set(database.items.map((i) => i.id))
  const start = maps.find((map) => map.id === meta.startMapId)

  return [
    ...(hasUniqueIds(maps) ? [] : [{ path: ['maps'], message: 'Maps must have unique ids' }]),
    ...(!start
      ? [{ path: ['meta', 'startMapId'], message: `Start map ${meta.startMapId} does not exist` }]
      : meta.startX >= start.width || meta.startY >= start.height
        ? [
            {
              path: ['meta'],
              message: `Start position (${meta.startX}, ${meta.startY}) lies outside map ${start.id}`,
            },
          ]
        : []),
    ...meta.startParty.flatMap((actorId, index) =>
      database.actors.some((actor) => actor.id === actorId)
        ? []
        : [
            {
              path: ['meta', 'startParty', index],
              message: `Starting party member ${actorId} is not an actor`,
            },
          ],
    ),
    ...database.actors.flatMap((actor, index) =>
      classIds.has(actor.classId)
        ? []
        : [
            {
              path: ['database', 'actors', index, 'classId'],
              message: `Actor ${actor.id} references missing class ${actor.classId}`,
            },
          ],
    ),
    ...database.classes.flatMap((actorClass, index) =>
      actorClass.learnings.flatMap((learning, learningIndex) =>
        skillIds.has(learning.skillId)
          ? []
          : [
              {
                path: ['database', 'classes', index, 'learnings', learningIndex, 'skillId'],
                message: `Class ${actorClass.id} learns missing skill ${learning.skillId}`,
              },
            ],
      ),
    ),
    ...maps.flatMap((map, mapIndex) =>
      map.events.flatMap((event, eventIndex) =>
        event.pages.flatMap((page, pageIndex) =>
          flattenCommands(page.commands).flatMap((command) => {
            if (command.command !== 'TransferPlayer') return []
            const path = ['maps', mapIndex, 'events', eventIndex, 'pages', pageIndex, 'commands']
            const destination = maps.find((candidate) => candidate.id === command.mapId)
            if (!destination) {
              return [
                {
                  path,
                  message: `Event ${event.id} on map ${map.id} transfers to missing map ${command.mapId}`,
                },
              ]
            }
            return command.x < destination.width && command.y < destination.height
              ? []
              : [
                  {
                    path,
                    message: `Event ${event.id} on map ${map.id} transfers to (${command.x}, ${command.y}), outside map ${destination.id}`,
                  },
                ]
          }),
        ),
      ),
    ),
    ...database.enemies.flatMap((enemy, index) => [
      ...enemy.skillIds.flatMap((skillId, skillIndex) =>
        skillIds.has(skillId)
          ? []
          : [
              {
                path: ['database', 'enemies', index, 'skillIds', skillIndex],
                message: `Enemy ${enemy.id} uses missing skill ${skillId}`,
              },
            ],
      ),
      ...enemy.drops.flatMap((drop, dropIndex) =>
        itemIds.has(drop.itemId)
          ? []
          : [
              {
                path: ['database', 'enemies', index, 'drops', dropIndex, 'itemId'],
                message: `Enemy ${enemy.id} drops missing item ${drop.itemId}`,
              },
            ],
      ),
    ]),
  ]
}

/** The complete, validated in-memory state of a game project. */
export const ProjectSchema = ProjectShapeSchema.check(issuesCheck(validateProject))
export type Project = z.infer<typeof ProjectSchema>
