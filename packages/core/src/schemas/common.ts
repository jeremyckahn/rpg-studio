import { z } from 'zod'

/** Database ids are positive integers, as in RPG Maker. */
export const IdSchema = z.int().min(1)
export type Id = z.infer<typeof IdSchema>

export const NameSchema = z.string().trim().min(1).max(64)

export const DescriptionSchema = z.string().max(1000)

export const DirectionSchema = z.enum(['up', 'down', 'left', 'right'])
export type Direction = z.infer<typeof DirectionSchema>

export const PointSchema = z.strictObject({ x: z.int(), y: z.int() })
export type Point = z.infer<typeof PointSchema>

/**
 * Project-relative asset path using forward slashes. Absolute paths, drive
 * letters, backslashes and `..` segments are rejected so that neither a plugin
 * nor an AI agent can address files outside the project.
 */
export const AssetPathSchema = z
  .string()
  .min(1)
  .max(256)
  .refine(
    (path) =>
      !path.startsWith('/') &&
      !path.includes('\\') &&
      !/^[a-zA-Z]:/.test(path) &&
      path.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..'),
    {
      error: 'Asset paths must be relative, use "/" separators and contain no "." or ".." segments',
    },
  )
export type AssetPath = z.infer<typeof AssetPathSchema>

/** Plugin-owned data attached to a record. Strict JSON only. */
export const ExtensionsSchema = z.record(z.string(), z.json())
export type Extensions = z.infer<typeof ExtensionsSchema>

/** `#rrggbb` or `#rrggbbaa`. */
export const HexColorSchema = z.string().regex(/^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, {
  error: 'Expected a #rrggbb or #rrggbbaa colour',
})

/** Rejects tables whose records share an `id`. */
export const hasUniqueIds = (records: readonly { readonly id: number }[]): boolean =>
  new Set(records.map((record) => record.id)).size === records.length
