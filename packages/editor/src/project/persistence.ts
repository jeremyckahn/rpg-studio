import {
  type Project,
  type Result,
  PROJECT_FILE,
  fail,
  filesToProject,
  ok,
  projectToFiles,
} from '@rpgstudio/core'

import { type AssetStore } from './assetStore.ts'
import { type ProjectFileSystem } from './fileSystem.ts'

const MAP_FILE = /^maps\/[^/]+\.json$/
const DATA_FILE = /^data\/[^/]+\.json$/

/** The project's JSON files, as opposed to assets. */
export const isProjectDataFile = (path: string): boolean =>
  path === PROJECT_FILE || MAP_FILE.test(path) || DATA_FILE.test(path)

/** Folders whose files belong to the project; anything else on disk is left alone. */
const ASSET_ROOTS = ['img/', 'audio/', 'plugins/'] as const

export const isAssetFile = (path: string): boolean =>
  ASSET_ROOTS.some((root) => path.startsWith(root))

/** The last text written to (or read from) disk for each project file. */
export type SaveCache = ReadonlyMap<string, string>

export interface LoadedProject {
  readonly project: Project
  readonly assets: Readonly<Record<string, Uint8Array>>
  readonly cache: SaveCache
}

const decoder = new TextDecoder()

/** Reads a project folder. Data files are validated; assets are read as raw bytes. */
export const loadProject = async (
  fs: ProjectFileSystem,
): Promise<Result<LoadedProject, string[]>> => {
  const paths = await fs.list()
  if (!paths.includes(PROJECT_FILE)) {
    return fail([`This folder is not an RPG Studio project: ${PROJECT_FILE} is missing`])
  }

  const dataPaths = paths.filter(isProjectDataFile)
  const dataEntries = await Promise.all(
    dataPaths.map(async (path) => [path, decoder.decode(await fs.readFile(path))] as const),
  )
  const parsed = filesToProject(Object.fromEntries(dataEntries))
  if (!parsed.success) return parsed

  const assetEntries = await Promise.all(
    paths.filter(isAssetFile).map(async (path) => [path, await fs.readFile(path)] as const),
  )
  return ok({
    project: parsed.data,
    assets: Object.fromEntries(assetEntries),
    cache: new Map(dataEntries),
  })
}

export interface SaveReport {
  readonly written: readonly string[]
  readonly deleted: readonly string[]
  readonly cache: SaveCache
}

/**
 * Writes the project to disk, touching only files that changed: project JSON
 * whose text differs from what is already there, assets written since the last
 * save, and files for maps or assets that were removed.
 */
export const saveProject = async (
  fs: ProjectFileSystem,
  project: Project,
  assets: AssetStore,
  cache: SaveCache,
): Promise<SaveReport> => {
  const files = projectToFiles(project)
  const changedData = Object.entries(files).filter(([path, text]) => cache.get(path) !== text)
  const staleData = [...cache.keys()].filter((path) => !(path in files))
  const writes = assets.unsavedWrites()
  const removals = assets.unsavedRemovals()

  await Promise.all([
    ...changedData.map(([path, text]) => fs.writeFile(path, text)),
    ...writes.map((path) => fs.writeFile(path, assets.readBytes(path) ?? new Uint8Array())),
  ])
  await Promise.all([...staleData, ...removals].map((path) => fs.deleteFile(path)))

  return {
    written: [...changedData.map(([path]) => path), ...writes],
    deleted: [...staleData, ...removals],
    cache: new Map(Object.entries(files)),
  }
}
