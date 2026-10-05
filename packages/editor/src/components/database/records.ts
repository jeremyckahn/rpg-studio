import {
  type Database,
  type DatabaseTableName,
  type Project,
  ActorSchema,
  ClassSchema,
  DATABASE_RECORD_SCHEMAS,
  EnemySchema,
  ItemSchema,
  SkillSchema,
  type Result,
  fail,
  ok,
} from '@rpgstudio/core'

const nextId = (rows: readonly { readonly id: number }[]): number =>
  Math.max(0, ...rows.map((row) => row.id)) + 1

/** The schema of a table's records, which drives the grid's columns. */
export const recordSchema = (table: DatabaseTableName) => DATABASE_RECORD_SCHEMAS[table]

export type DatabaseRecord = Database[DatabaseTableName][number]

/**
 * A new, valid record for `table` with the next free id, built through the
 * table's own schema so every default comes from there. Actors need a class to
 * point at, so they cannot be created until one exists.
 */
export const newRecord = (project: Project, table: DatabaseTableName): Result<DatabaseRecord> => {
  const id = nextId(project.database[table])
  const stats = { maxHp: 100, maxMp: 10, attack: 10, defense: 10, magic: 10, speed: 10, luck: 10 }
  const growth = { maxHp: 10, maxMp: 1, attack: 1, defense: 1, magic: 1, speed: 1, luck: 0 }
  switch (table) {
    case 'actors': {
      const classId = project.database.classes[0]?.id
      return classId === undefined
        ? fail('Create a class first: every actor needs one')
        : ok(ActorSchema.parse({ id, name: `Actor ${id}`, classId }))
    }
    case 'classes':
      return ok(ClassSchema.parse({ id, name: `Class ${id}`, baseStats: stats, growth }))
    case 'items':
      return ok(ItemSchema.parse({ id, name: `Item ${id}`, kind: 'consumable' }))
    case 'skills':
      return ok(SkillSchema.parse({ id, name: `Skill ${id}`, target: 'enemy' }))
    case 'enemies':
      return ok(EnemySchema.parse({ id, name: `Enemy ${id}`, stats }))
  }
}
