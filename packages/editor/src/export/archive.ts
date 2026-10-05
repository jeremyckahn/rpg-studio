import {
  type Project,
  type Result,
  filesToProject,
  projectToFiles,
  fail,
  ok,
} from '@rpgstudio/core'

import { type AssetReader } from './packager.ts'
import { isAssetFile, isProjectDataFile } from '../project/persistence.ts'
import { unzipEntries, zipEntries } from './zip.ts'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

/** The whole project as a `.zip`: JSON data plus every asset, `.piskel` sources included. */
export const exportProjectArchive = (project: Project, assets: AssetReader): Promise<Uint8Array> =>
  zipEntries({
    ...Object.fromEntries(
      Object.entries(projectToFiles(project)).map(([path, text]) => [path, encoder.encode(text)]),
    ),
    ...Object.fromEntries(
      assets.list().map((path) => [path, assets.readBytes(path) ?? new Uint8Array()] as const),
    ),
  })

export interface ImportedProject {
  readonly project: Project
  readonly assets: Readonly<Record<string, Uint8Array>>
}

/** Reads a project `.zip` made by `exportProjectArchive`, validating its data. */
export const importProjectArchive = async (
  archive: Uint8Array,
): Promise<Result<ImportedProject, string[]>> => {
  const files = await unzipEntries(archive)
  const dataEntries = Object.entries(files)
    .filter(([path]) => isProjectDataFile(path))
    .map(([path, bytes]) => [path, decoder.decode(bytes)] as const)
  if (!dataEntries.some(([path]) => path === 'project.json')) {
    return fail(['This archive is not an RPG Studio project: project.json is missing'])
  }
  const parsed = filesToProject(Object.fromEntries(dataEntries))
  if (!parsed.success) return parsed
  return ok({
    project: parsed.data,
    assets: Object.fromEntries(Object.entries(files).filter(([path]) => isAssetFile(path))),
  })
}
