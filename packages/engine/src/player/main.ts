import { createAudioManager, createAudioPathResolver, installAudioUnlock } from '../audio/index.ts'
import { createPixiSoundBackend } from '../audio/pixiSoundBackend.ts'
import { createGame } from '../game/game.ts'
import { createFixedStepClock } from '../game/clock.ts'
import { createEnginePluginManager } from '../plugins/host.ts'
import { createAssetTextureProvider } from '../renderer/textures.ts'
import { createGameRenderer } from '../renderer/gameRenderer.ts'
import { loadGameBundle } from './bundle.ts'
import { createKeyboardInput } from './input.ts'
import { createMessageBox } from './messageBox.ts'

export interface PlayerOptions {
  /** Where `game.json` and the assets live. Defaults to the page's own folder. */
  readonly baseUrl?: string
}

export interface PlayerHandle {
  stop: () => void
}

const showError = (root: HTMLElement, error: unknown): void => {
  const pre = root.ownerDocument.createElement('pre')
  pre.style.cssText = 'color:#ff8a8a;padding:16px;white-space:pre-wrap;font:14px monospace'
  pre.textContent = error instanceof Error ? error.message : String(error)
  root.replaceChildren(pre)
}

/**
 * Boots an exported RPG Studio game inside `root`: loads and validates the
 * data, wires audio (unlocked by the first gesture), renders with PixiJS, and
 * advances the simulation at a fixed 60 ticks per second.
 */
export const startPlayer = async (
  root: HTMLElement,
  options: PlayerOptions = {},
): Promise<PlayerHandle> => {
  const baseUrl = new URL(options.baseUrl ?? './', document.baseURI)
  const urlFor = (path: string): string => new URL(path, baseUrl).href

  try {
    const loaded = await loadGameBundle(async (path) => {
      const response = await fetch(urlFor(path))
      if (!response.ok) throw new Error(`Could not load ${path} (${response.status})`)
      return response.text()
    })

    const audio = createAudioManager({
      backend: createPixiSoundBackend({ urlFor }),
      resolvePath: createAudioPathResolver(loaded.bundle.files),
    })
    const stopUnlock = installAudioUnlock(window, () => audio.unlock())

    root.style.position = 'relative'
    const canvas = root.ownerDocument.createElement('canvas')
    canvas.style.cssText = 'display:block;width:100%;height:100%;image-rendering:pixelated'
    root.replaceChildren(canvas)

    const game = createGame({ project: loaded.project, audio })
    const plugins = createEnginePluginManager(game, { audio })
    loaded.plugins.forEach((registration) => plugins.register(registration))
    await plugins.initialize()

    const textures = createAssetTextureProvider({ urlFor })
    const renderer = await createGameRenderer({ canvas, game, textures, resizeTo: root })
    const messageBox = createMessageBox(root, game.bus)
    const input = createKeyboardInput(window)
    const clock = createFixedStepClock()

    const onFrame = ({ deltaMS }: { deltaMS: number }): void => {
      const ticks = clock.advance(deltaMS)
      for (let i = 0; i < ticks; i++) game.tick(input.poll())
      renderer.render()
    }
    renderer.app.ticker.add(onFrame)

    return {
      stop: () => {
        renderer.app.ticker.remove(onFrame)
        stopUnlock()
        input.dispose()
        messageBox.dispose()
        audio.stopAll()
        void plugins.teardown()
        renderer.destroy()
      },
    }
  } catch (error) {
    showError(root, error)
    throw error
  }
}
