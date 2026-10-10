import { type PluginRegistration, type Project } from '@rpgstudio/core'
import { type EngineCapabilities } from '@rpgstudio/engine'
import { createPixiSoundBackend } from '@rpgstudio/engine/audio'
import { loadEnginePlugins } from '@rpgstudio/engine/player'
import { createAssetTextureProvider } from '@rpgstudio/engine/renderer'

import { findGameProblems } from '../export/packager.ts'
import { type FilesReadCapability } from '../plugins/editorHost.ts'
import { type RootState } from '../store/index.ts'
import { type PreviewHost } from './previewController.ts'
import { createAssetUrls } from './previewAssets.ts'

type Plugins = readonly PluginRegistration<EngineCapabilities>[]

export interface EditorPreviewHost extends PreviewHost {
  /** Frees the blob URLs handed to the audio player. */
  dispose: () => void
}

const mimeFor = (path: string): string => {
  const extension = path.slice(path.lastIndexOf('.') + 1).toLowerCase()
  return extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg' : `image/${extension}`
}

/**
 * Connects the preview to the open project. Textures and sounds come from the asset store, never
 * the network. Creating one has no effect on the world; listening starts with `watch`.
 *
 * The preview has a texture provider of its own rather than the map canvas's: each canvas then
 * owns the textures it draws, and tearing one canvas down cannot pull textures out from under the
 * other.
 */
export const createPreviewHost = (deps: {
  readonly store: {
    getState: () => RootState
    subscribe: (listener: () => void) => () => void
  }
  readonly read: FilesReadCapability
}): EditorPreviewHost => {
  const { store, read } = deps
  const urls = createAssetUrls(read.readBytes)
  const textures = createAssetTextureProvider({
    loadBlob: (path) => {
      const bytes = read.readBytes(path)
      return bytes
        ? Promise.resolve(new Blob([new Uint8Array(bytes)], { type: mimeFor(path) }))
        : Promise.reject(new Error(`${path} is not in the project`))
    },
  })

  let token = 0
  let pluginCache: { readonly signature: string; readonly plugins: Plugins } | null = null

  return {
    textures,
    soundBackend: createPixiSoundBackend({ urlFor: urls.urlFor }),
    getProject: () => store.getState().project.data,
    version: () => String(token),
    watch: (listener) => {
      const first = store.getState()
      let seen = {
        project: first.project.data,
        paths: first.assets.paths,
        versions: first.assets.versions,
      }
      return store.subscribe(() => {
        const state = store.getState()
        const projectChanged = state.project.data !== seen.project
        const assetsChanged =
          state.assets.paths !== seen.paths || state.assets.versions !== seen.versions
        if (!projectChanged && !assetsChanged) return
        seen = {
          project: state.project.data,
          paths: state.assets.paths,
          versions: state.assets.versions,
        }
        token += 1
        // Before anyone is told: a reload must draw the new pixels, not the cached old ones.
        if (assetsChanged) textures.invalidate()
        listener()
      })
    },
    findProblems: (project: Project) =>
      findGameProblems(project, { list: read.list, readBytes: read.readBytes }),
    listFiles: read.list,
    loadPlugins: async (project) => {
      const ids = project.meta.plugins
      // Plugin code is turned into modules, which the browser never frees, so unchanged plugins
      // are reused across reloads instead of being loaded again.
      const signature = JSON.stringify(
        ids.map((id) =>
          read
            .list()
            .filter((path) => path.startsWith(`plugins/${id}/`))
            .map((path) => [path, read.readText(path)]),
        ),
      )
      if (pluginCache?.signature === signature) return pluginCache.plugins
      const plugins = await loadEnginePlugins(ids, (path) => {
        const text = read.readText(path)
        return text === undefined
          ? Promise.reject(new Error(`${path} is missing`))
          : Promise.resolve(text)
      })
      pluginCache = { signature, plugins }
      return plugins
    },
    dispose: () => {
      urls.dispose()
    },
  }
}
