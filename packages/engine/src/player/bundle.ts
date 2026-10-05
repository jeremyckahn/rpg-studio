import {
  GAME_BUNDLE_FILE,
  type GameBundle,
  GameBundleSchema,
  type Project,
  filesToProject,
  loadPluginPackage,
  parsePluginManifest,
} from '@rpgstudio/core'

import { type EngineCapabilities } from '../plugins/host.ts'
import { type PluginRegistration } from '@rpgstudio/core'

export type TextFetcher = (path: string) => Promise<string>

/** The project's JSON files (as opposed to images, audio and plugin code). */
const isProjectData = (path: string): boolean =>
  path === 'project.json' || /^(?:data|maps)\/[^/]+\.json$/.test(path)

export interface LoadedBundle {
  readonly bundle: GameBundle
  readonly project: Project
  readonly plugins: readonly PluginRegistration<EngineCapabilities>[]
}

/**
 * Loads an exported game: `game.json` first, then exactly the project data and
 * engine-side plugin files it lists. Everything is validated with Zod before
 * the engine sees it.
 */
export const loadGameBundle = async (fetchText: TextFetcher): Promise<LoadedBundle> => {
  const manifestJson: unknown = JSON.parse(await fetchText(GAME_BUNDLE_FILE))
  const parsed = GameBundleSchema.safeParse(manifestJson)
  if (!parsed.success) throw new Error(`${GAME_BUNDLE_FILE} is invalid: ${parsed.error.message}`)
  const bundle = parsed.data

  const dataPaths = bundle.files.filter(isProjectData)
  const dataEntries = await Promise.all(
    dataPaths.map(async (path) => [path, await fetchText(path)] as const),
  )
  const project = filesToProject(Object.fromEntries(dataEntries))
  if (!project.success) {
    throw new Error(`The game data is invalid:\n${project.error.join('\n')}`)
  }

  const plugins = await Promise.all(
    bundle.plugins.map(async (id) => {
      const manifestPath = `plugins/${id}/manifest.json`
      const manifestText = await fetchText(manifestPath)
      const { entries } = parsePluginManifest(manifestText)
      // Fetch only the shared and engine heads; editor code is never requested.
      const wanted = [entries.shared, entries.engine].filter(
        (path): path is string => path !== undefined,
      )
      const fetched = await Promise.all(
        wanted.map(async (path) => [path, await fetchText(`plugins/${id}/${path}`)] as const),
      )
      return loadPluginPackage<EngineCapabilities>(
        { 'manifest.json': manifestText, ...Object.fromEntries(fetched) },
        'engine',
      )
    }),
  )

  return { bundle, project: project.data, plugins }
}
