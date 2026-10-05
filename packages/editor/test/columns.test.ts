import {
  ActorSchema,
  ClassSchema,
  EnemySchema,
  ItemSchema,
  createStarterProject,
} from '@rpgstudio/core'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { newRecord, recordSchema } from '../src/components/database/records'
import {
  describeField,
  fieldsOf,
  formatJson,
  parseJsonCell,
} from '../src/components/database/schemaColumns'

const kinds = (schema: z.ZodObject) =>
  Object.fromEntries(fieldsOf(schema).map((f) => [f.field, f.kind]))

describe('schema-driven columns', () => {
  it('derives the column kind of every field from the Zod schema', () => {
    expect(kinds(ActorSchema)).toEqual({
      id: 'number',
      name: 'string',
      nickname: 'string',
      classId: 'number',
      initialLevel: 'number',
      maxLevel: 'number',
      description: 'string',
      sprite: 'json',
      face: 'string',
      extensions: 'json',
    })
    expect(kinds(ItemSchema)).toMatchObject({
      kind: 'enum',
      effects: 'json',
      statBonuses: 'json',
      price: 'number',
    })
    expect(kinds(EnemySchema)).toMatchObject({ stats: 'json', drops: 'json', skillIds: 'json' })
    expect(kinds(ClassSchema)).toMatchObject({
      baseStats: 'json',
      growth: 'json',
      learnings: 'json',
    })
  })

  it('knows enum choices, integers, optionality and the read-only id', () => {
    const item = Object.fromEntries(fieldsOf(ItemSchema).map((f) => [f.field, f]))
    expect(item['kind']?.options).toEqual(['consumable', 'weapon', 'armor', 'key'])
    expect(item['price']).toMatchObject({ integer: true, optional: true, readOnly: false })
    expect(item['id']).toMatchObject({ readOnly: true, optional: false })
    expect(item['name']?.optional).toBe(false)
  })

  it('looks through default, optional and nullable wrappers', () => {
    expect(describeField('a', z.string().optional().default('x'))).toMatchObject({
      kind: 'string',
      optional: true,
    })
    expect(describeField('b', z.number().nullable())).toMatchObject({
      kind: 'number',
      optional: true,
      integer: false,
    })
    expect(describeField('c', z.boolean())).toMatchObject({ kind: 'boolean', optional: false })
    expect(describeField('d', z.enum(['x', 'y']))).toMatchObject({
      kind: 'enum',
      options: ['x', 'y'],
    })
    expect(describeField('e', z.array(z.string()))).toMatchObject({ kind: 'json' })
    expect(describeField('f', z.int())).toMatchObject({ kind: 'number', integer: true })
  })

  it('round-trips JSON cells and hands invalid text back so validation can explain it', () => {
    expect(formatJson({ a: [1, 2] })).toBe('{"a":[1,2]}')
    expect(formatJson(undefined)).toBe('')
    expect(parseJsonCell('{"a":[1,2]}')).toEqual({ a: [1, 2] })
    expect(parseJsonCell('')).toBeUndefined()
    expect(parseJsonCell('{oops')).toBe('{oops')
    expect(parseJsonCell(5)).toBe(5)
  })
})

describe('new records', () => {
  const project = createStarterProject('P')

  it('creates a schema-valid record with the next free id for every table', () => {
    ;(['actors', 'classes', 'items', 'skills', 'enemies'] as const).forEach((table) => {
      const created = newRecord(project, table)
      expect(created.success, table).toBe(true)
      if (!created.success) return
      expect(created.data.id).toBe(Math.max(...project.database[table].map((r) => r.id), 0) + 1)
      expect(recordSchema(table).safeParse(created.data).success, table).toBe(true)
    })
  })

  it('will not create an actor when there is no class to point it at', () => {
    const noClasses = { ...project, database: { ...project.database, classes: [], actors: [] } }
    expect(newRecord(noClasses, 'actors')).toEqual({
      success: false,
      error: 'Create a class first: every actor needs one',
    })
  })
})
