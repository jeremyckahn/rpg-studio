import { z } from 'zod'

import { AssetPathSchema, NameSchema } from '../schemas/common.ts'
import { PluginIdSchema } from '../schemas/project.ts'
import { type ValidationIssue, issuesCheck } from '../schemas/refine.ts'

export const PLUGIN_TARGETS = ['editor', 'engine'] as const
export const PluginTargetSchema = z.enum(PLUGIN_TARGETS)
export type PluginTarget = z.infer<typeof PluginTargetSchema>

/**
 * Everything a plugin can ask the host for. A plugin only receives the
 * capabilities its manifest declares.
 */
export const CAPABILITIES = [
  'events',
  'schemas',
  'log',
  'store',
  'ui',
  'files:read',
  'files:write',
  'ecs',
  'render',
  'audio',
] as const
export const CapabilitySchema = z.enum(CAPABILITIES)
export type Capability = z.infer<typeof CapabilitySchema>

const SemverSchema = z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, {
  error: 'Expected a semantic version such as 1.2.3',
})

const PluginManifestShapeSchema = z.strictObject({
  id: PluginIdSchema,
  name: NameSchema,
  version: SemverSchema,
  description: z.string().max(1000).default(''),
  capabilities: z.array(CapabilitySchema).default([]),
  /** Ids of plugins that must be initialised first. */
  dependencies: z.array(PluginIdSchema).default([]),
  /** Names of the Zod schemas this plugin may register from its shared entry. */
  schemas: z.array(z.string().min(1).max(64)).default([]),
  entries: z.strictObject({
    shared: AssetPathSchema.optional(),
    editor: AssetPathSchema.optional(),
    engine: AssetPathSchema.optional(),
  }),
})

const validateManifest = (
  manifest: z.infer<typeof PluginManifestShapeSchema>,
): ValidationIssue[] => [
  ...(manifest.entries.shared || manifest.entries.editor || manifest.entries.engine
    ? []
    : [{ path: ['entries'], message: 'A plugin must declare at least one entry point' }]),
  ...(manifest.dependencies.includes(manifest.id)
    ? [{ path: ['dependencies'], message: 'A plugin cannot depend on itself' }]
    : []),
  ...(['capabilities', 'dependencies', 'schemas'] as const).flatMap((field) =>
    new Set(manifest[field]).size === manifest[field].length
      ? []
      : [{ path: [field], message: `"${field}" must not contain duplicates` }],
  ),
]

/**
 * `manifest.json` of a two-headed plugin. `shared` is loaded by both targets,
 * `editor` only by the editor workspace and `engine` only by the exported game.
 */
export const PluginManifestSchema = PluginManifestShapeSchema.check(issuesCheck(validateManifest))
export type PluginManifest = z.infer<typeof PluginManifestSchema>
