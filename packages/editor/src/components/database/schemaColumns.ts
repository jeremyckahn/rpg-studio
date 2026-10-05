import { type z } from 'zod'

export type FieldKind = 'string' | 'number' | 'boolean' | 'enum' | 'json'

export interface FieldSpec {
  readonly field: string
  readonly kind: FieldKind
  /** Choices for `enum` fields. */
  readonly options: readonly string[]
  readonly integer: boolean
  /** The field may be absent (optional, or filled in by a default). */
  readonly optional: boolean
  /** Primary keys are shown but not edited. */
  readonly readOnly: boolean
}

interface ZodDef {
  readonly type: string
  readonly innerType?: z.ZodType
  readonly entries?: Readonly<Record<string, unknown>>
}

const defOf = (schema: z.ZodType): ZodDef => schema.def

/**
 * Looks through `optional`, `default` and `nullable` wrappers to the schema that
 * says what the value really is, remembering whether any of them made it optional.
 */
const unwrap = (schema: z.ZodType): { inner: z.ZodType; optional: boolean } => {
  const def = defOf(schema)
  if (
    (def.type === 'optional' || def.type === 'default' || def.type === 'nullable') &&
    def.innerType
  ) {
    return { inner: unwrap(def.innerType).inner, optional: true }
  }
  return { inner: schema, optional: false }
}

/** Describes one field of a record schema well enough to build an editor column for it. */
export const describeField = (field: string, schema: z.ZodType): FieldSpec => {
  const { inner, optional } = unwrap(schema)
  const def = defOf(inner)
  const base = {
    field,
    optional,
    readOnly: field === 'id',
    integer: false,
    options: [] as string[],
  }
  switch (def.type) {
    case 'string':
      return { ...base, kind: 'string' }
    case 'boolean':
      return { ...base, kind: 'boolean' }
    case 'number':
      return {
        ...base,
        kind: 'number',
        integer: (inner as unknown as { isInt?: boolean }).isInt === true,
      }
    case 'enum':
      return { ...base, kind: 'enum', options: Object.keys(def.entries ?? {}) }
    default:
      // Objects, arrays, records and unions are edited as JSON.
      return { ...base, kind: 'json' }
  }
}

/** One spec per field of a record schema, in declaration order. */
export const fieldsOf = (schema: z.ZodObject): readonly FieldSpec[] =>
  Object.entries(schema.shape).map(([field, fieldSchema]) =>
    describeField(field, fieldSchema as z.ZodType),
  )

/** The text shown for a value in a JSON cell. */
export const formatJson = (value: unknown): string =>
  value === undefined ? '' : JSON.stringify(value)

/**
 * Reads a JSON cell back. Text that is not valid JSON is returned unchanged so
 * the record fails Zod validation with a message, instead of being dropped.
 */
export const parseJsonCell = (text: unknown): unknown => {
  if (typeof text !== 'string') return text
  if (text.trim() === '') return undefined
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}
