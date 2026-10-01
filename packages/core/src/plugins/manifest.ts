import { z } from 'zod';

export const PluginCapabilitySchema = z.enum([
  'storage:read',
  'storage:write',
  'events:emit',
  'events:listen',
  'ui:panel',
  'engine:system',
  'network:companion',
]);
export type PluginCapability = z.infer<typeof PluginCapabilitySchema>;

export const PluginManifestSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/i, 'Plugin ID must be alphanumeric and hyphens'),
  name: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+/, 'Must follow semantic versioning'),
  description: z.string().default(''),
  author: z.string().default(''),
  capabilities: z.array(PluginCapabilitySchema).default([]),
  entryPoints: z.object({
    shared: z.string().optional(),
    editor: z.string().optional(),
    engine: z.string().optional(),
  }).default({}),
  dependencies: z.record(z.string(), z.string()).default({}),
}).strict();
export type PluginManifest = z.infer<typeof PluginManifestSchema>;
