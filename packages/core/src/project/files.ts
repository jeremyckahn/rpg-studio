import { type z } from 'zod'

import { type Result, fail, ok } from '../result.ts'
import { ActorSchema, ClassSchema } from '../schemas/actor.ts'
import { EnemySchema, ItemSchema, SkillSchema } from '../schemas/item.ts'
import {
  DATABASE_TABLES,
  type DatabaseTableName,
  type Project,
  ProjectMetaSchema,
  ProjectSchema,
} from '../schemas/project.ts'
import { TilemapSchema } from '../schemas/tilemap.ts'

/** Project-relative path of the project metadata file. */
export const PROJECT_FILE = 'project.json'

export const databaseFilePath = (table: DatabaseTableName): string => `data/${table}.json`

export const mapFilePath = (mapId: number): string =>
  `maps/map-${String(mapId).padStart(3, '0')}.json`

const MAP_FILE_PATTERN = /^maps\/map-\d+\.json$/

const TABLE_SCHEMAS = {
  actors: ActorSchema,
  classes: ClassSchema,
  items: ItemSchema,
  skills: SkillSchema,
  enemies: EnemySchema,
} as const satisfies Record<DatabaseTableName, z.ZodType>

/** Strict, deterministic JSON: two-space indent, trailing newline. */
export const toJsonText = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`

/** Serialises a project to its on-disk JSON files, keyed by project-relative path. */
export const projectToFiles = (project: Project): Record<string, string> => ({
  [PROJECT_FILE]: toJsonText(project.meta),
  ...Object.fromEntries(
    DATABASE_TABLES.map((table) => [databaseFilePath(table), toJsonText(project.database[table])]),
  ),
  ...Object.fromEntries(project.maps.map((map) => [mapFilePath(map.id), toJsonText(map)])),
})

const parseJson = (path: string, text: string | undefined): Result<unknown> => {
  if (text === undefined) return fail(`${path}: file is missing`)
  try {
    return ok(JSON.parse(text))
  } catch (error) {
    return fail(
      `${path}: not valid JSON (${error instanceof Error ? error.message : String(error)})`,
    )
  }
}

const parseWith = <S extends z.ZodType>(
  path: string,
  text: string | undefined,
  schema: S,
): Result<z.infer<S>> => {
  const json = parseJson(path, text)
  if (!json.success) return json
  const parsed = schema.safeParse(json.data)
  return parsed.success ? ok(parsed.data) : fail(`${path}: ${parsed.error.message}`)
}

/**
 * Reads a project back from its JSON files. Each file is validated on its own so
 * errors name the offending file, then the assembled project is validated again
 * for cross-references. Missing database tables are treated as empty.
 */
export const filesToProject = (
  files: Readonly<Record<string, string>>,
): Result<Project, string[]> => {
  const meta = parseWith(PROJECT_FILE, files[PROJECT_FILE], ProjectMetaSchema)

  const tables = DATABASE_TABLES.map((table) => {
    const path = databaseFilePath(table)
    return files[path] === undefined
      ? ([table, ok([])] as const)
      : ([table, parseWith(path, files[path], TABLE_SCHEMAS[table].array())] as const)
  })

  const mapPaths = Object.keys(files)
    .filter((path) => MAP_FILE_PATTERN.test(path))
    .toSorted()
  const maps = mapPaths.map((path) => parseWith(path, files[path], TilemapSchema))

  const errors = [
    ...(meta.success ? [] : [meta.error]),
    ...tables.flatMap(([, result]) => (result.success ? [] : [result.error])),
    ...maps.flatMap((result) => (result.success ? [] : [result.error])),
  ]
  if (errors.length > 0 || !meta.success) return fail(errors)

  const assembled = ProjectSchema.safeParse({
    meta: meta.data,
    database: Object.fromEntries(
      tables.map(([table, result]) => [table, result.success ? result.data : []]),
    ),
    maps: maps.flatMap((result) => (result.success ? [result.data] : [])),
  })
  return assembled.success
    ? ok(assembled.data)
    : fail(
        assembled.error.issues.map(
          (issue) => `${issue.path.join('.') || 'project'}: ${issue.message}`,
        ),
      )
}
