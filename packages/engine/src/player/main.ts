import { createPixiSoundBackend } from '../audio/pixiSoundBackend.ts'
import { createAssetTextureProvider } from '../renderer/textures.ts'
import { loadGameBundle } from './bundle.ts'
import { createPlayerSession } from './session.ts'

export interface PlayerOptions {
  /** Where `game.json` and the assets live. Defaults to the page's own folder. */
  readonly baseUrl?: string
  /**
   * On-screen D-pad and action button. `auto` (the default) shows them on touch screens
   * only; `on` and `off` force them.
   */
  readonly touchControls?: 'auto' | 'on' | 'off'
}

export interface PlayerHandle {
  stop: () => void
  /** Freezes the game and its sound on the current frame. */
  pause: () => void
  resume: () => void
  readonly paused: boolean
}

const showError = (root: HTMLElement, error: unknown): void => {
  const pre = root.ownerDocument.createElement('pre')
  pre.style.cssText = 'color:#ff8a8a;padding:16px;white-space:pre-wrap;font:14px monospace'
  pre.textContent = error instanceof Error ? error.message : String(error)
  root.replaceChildren(pre)
}

/**
 * Boots an exported RPG Studio game inside `root`: loads and validates the
 * data over HTTP, then hands it to a player session (see `createPlayerSession`).
 */
export const startPlayer = async (
  root: HTMLElement,
  options: PlayerOptions = {},
): Promise<PlayerHandle> => {
  const baseUrl = new URL(options.baseUrl ?? './', document.baseURI)
  const urlFor = (path: string): string => new URL(path, baseUrl).href
  const fetchOk = async (path: string): Promise<Response> => {
    const response = await fetch(urlFor(path))
    if (!response.ok) throw new Error(`Could not load ${path} (${response.status})`)
    return response
  }

  try {
    const loaded = await loadGameBundle(async (path) => (await fetchOk(path)).text())
    const session = await createPlayerSession({
      root,
      project: loaded.project,
      plugins: loaded.plugins,
      listFiles: () => loaded.bundle.files,
      textures: createAssetTextureProvider({
        loadBlob: async (path) => (await fetchOk(path)).blob(),
      }),
      soundBackend: createPixiSoundBackend({ urlFor }),
      ...(options.touchControls ? { touchControls: options.touchControls } : {}),
    })
    return {
      stop: session.stop,
      pause: session.pause,
      resume: session.resume,
      get paused() {
        return session.paused
      },
    }
  } catch (error) {
    showError(root, error)
    throw error
  }
}
