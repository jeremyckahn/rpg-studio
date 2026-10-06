import {
  DEFAULT_TILESET_PATH,
  createDefaultTilesetPng,
  createStarterProject,
} from '@rpgstudio/core'

import { type EditorStoreHandle } from '../store/index.ts'
import { assetsSlice } from '../store/slices/assets.ts'
import { editorUiSlice, type StatusMessage } from '../store/slices/editorUi.ts'
import { projectActions } from '../store/slices/project.ts'
import {
  type FetchBinary,
  buildExportEntries,
  downloadBytes,
  exportProjectArchive,
  importProjectArchive,
  loadEngineFiles,
  slugify,
  zipEntries,
} from '../export/index.ts'
import { type AssetStore } from './assetStore.ts'
import { type ProjectFileSystem, createDirectoryHandleFileSystem } from './fileSystem.ts'
import { type SaveCache, loadProject, saveProject } from './persistence.ts'

export interface ProjectSessionDeps {
  readonly handle: EditorStoreHandle
  readonly assets: AssetStore
  /** Asks the user for a folder. Defaults to the browser's directory picker. */
  readonly pickDirectory?: () => Promise<ProjectFileSystem>
  /** Hands a file to the user. Defaults to a browser download. */
  readonly download?: (filename: string, bytes: Uint8Array) => void
  /** Where the engine player is fetched from. */
  readonly baseUrl?: string
  readonly fetchFile?: FetchBinary
}

export interface ProjectSession {
  readonly assets: AssetStore
  /** Starts a fresh project with the built-in tileset. */
  newProject: (name?: string) => void
  /** Opens a project from a folder the user picks. Returns false if they cancel. */
  openFolder: () => Promise<boolean>
  openFileSystem: (fs: ProjectFileSystem) => Promise<boolean>
  openArchive: (archive: Uint8Array) => Promise<boolean>
  /** Saves to the open folder, asking for one first if there is none. */
  save: () => Promise<boolean>
  saveAs: () => Promise<boolean>
  exportGame: () => Promise<boolean>
  downloadProjectArchive: () => Promise<boolean>
}

const defaultPickDirectory = async (): Promise<ProjectFileSystem> => {
  if (typeof window.showDirectoryPicker !== 'function') {
    throw new Error('This browser cannot open folders. Use Import/Download project (.zip) instead.')
  }
  return createDirectoryHandleFileSystem(await window.showDirectoryPicker({ mode: 'readwrite' }))
}

const isAbort = (error: unknown): boolean =>
  error instanceof DOMException && error.name === 'AbortError'

/**
 * The editor's file operations: new, open, save and export. It owns the
 * connection between the Redux store, the asset store and the folder on disk,
 * and reports progress and problems through the store's status message.
 */
export const createProjectSession = ({
  handle,
  assets,
  pickDirectory = defaultPickDirectory,
  download = (filename, bytes) => {
    downloadBytes(filename, bytes)
  },
  baseUrl = import.meta.env.BASE_URL,
  fetchFile,
}: ProjectSessionDeps): ProjectSession => {
  const { store } = handle
  let fs: ProjectFileSystem | null = null
  let cache: SaveCache = new Map()

  // Keep the Redux mirror of the asset list in step with the asset store.
  assets.subscribe((event) => {
    if (event.type === 'changed') store.dispatch(assetsSlice.actions.assetChanged(event.path))
    else if (event.type === 'removed') store.dispatch(assetsSlice.actions.assetRemoved(event.path))
    else store.dispatch(assetsSlice.actions.assetsReset(assets.list()))
  })

  const say = (severity: StatusMessage['severity'], text: string): void => {
    store.dispatch(editorUiSlice.actions.statusShown({ severity, text }))
  }

  const guarded = async (action: () => Promise<boolean>): Promise<boolean> => {
    try {
      return await action()
    } catch (error) {
      if (isAbort(error)) return false
      say('error', error instanceof Error ? error.message : String(error))
      return false
    }
  }

  const newProject: ProjectSession['newProject'] = (name = 'My Game') => {
    assets.replaceAll({ [DEFAULT_TILESET_PATH]: createDefaultTilesetPng() })
    store.dispatch(projectActions.projectLoaded(createStarterProject(name)))
    store.dispatch(editorUiSlice.actions.projectOpened({ folderName: null }))
    fs = null
    cache = new Map()
    say('info', `Created “${name}”`)
  }

  const openFileSystem: ProjectSession['openFileSystem'] = (target) =>
    guarded(async () => {
      const loaded = await loadProject(target)
      if (!loaded.success) {
        say('error', loaded.error.slice(0, 3).join(' • '))
        return false
      }
      assets.replaceAll(loaded.data.assets)
      store.dispatch(projectActions.projectLoaded(loaded.data.project))
      store.dispatch(editorUiSlice.actions.projectOpened({ folderName: target.name }))
      fs = target
      cache = loaded.data.cache
      say('success', `Opened “${loaded.data.project.meta.name}” from ${target.name}`)
      return true
    })

  const openFolder: ProjectSession['openFolder'] = () =>
    guarded(async () => openFileSystem(await pickDirectory()))

  const openArchive: ProjectSession['openArchive'] = (archive) =>
    guarded(async () => {
      const imported = await importProjectArchive(archive)
      if (!imported.success) {
        say('error', imported.error.slice(0, 3).join(' • '))
        return false
      }
      assets.replaceAll(imported.data.assets)
      store.dispatch(projectActions.projectLoaded(imported.data.project))
      store.dispatch(editorUiSlice.actions.projectOpened({ folderName: null }))
      fs = null
      cache = new Map()
      say('success', `Imported “${imported.data.project.meta.name}”`)
      return true
    })

  const saveTo = async (target: ProjectFileSystem): Promise<boolean> => {
    const state = store.getState()
    const report = await saveProject(target, state.project.data, assets, cache)
    assets.markSaved()
    store.dispatch(assetsSlice.actions.assetsSaved())
    fs = target
    cache = report.cache
    store.dispatch(
      editorUiSlice.actions.projectSaved({
        revision: state.project.revision,
        folderName: target.name,
      }),
    )
    say(
      'success',
      report.written.length === 0
        ? 'Already saved'
        : `Saved ${report.written.length} file(s) to ${target.name}`,
    )
    return true
  }

  const saveAs: ProjectSession['saveAs'] = () => guarded(async () => saveTo(await pickDirectory()))

  const save: ProjectSession['save'] = () =>
    guarded(async () => (fs ? saveTo(fs) : saveTo(await pickDirectory())))

  const exportGame: ProjectSession['exportGame'] = () =>
    guarded(async () => {
      const project = store.getState().project.data
      const engine = await loadEngineFiles(baseUrl, fetchFile)
      const { entries, omitted } = buildExportEntries({ project, assets, engine })
      const archive = await zipEntries(entries)
      download(`${slugify(project.meta.name)}.zip`, archive)
      say(
        'success',
        `Exported ${Object.keys(entries).length} files` +
          (omitted.length > 0 ? ` (left out ${omitted.length} authoring file(s))` : ''),
      )
      return true
    })

  const downloadProjectArchive: ProjectSession['downloadProjectArchive'] = () =>
    guarded(async () => {
      const project = store.getState().project.data
      download(
        `${slugify(project.meta.name)}-project.zip`,
        await exportProjectArchive(project, assets),
      )
      say('success', 'Downloaded the project archive')
      return true
    })

  return {
    assets,
    newProject,
    openFolder,
    openFileSystem,
    openArchive,
    save,
    saveAs,
    exportGame,
    downloadProjectArchive,
  }
}
