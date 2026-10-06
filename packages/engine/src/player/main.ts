import { createAudioManager, createAudioPathResolver, installAudioUnlock } from '../audio/index.ts'
import { createPixiSoundBackend } from '../audio/pixiSoundBackend.ts'
import { createGame } from '../game/game.ts'
import { createFixedStepClock } from '../game/clock.ts'
import { createEnginePluginManager } from '../plugins/host.ts'
import { createAssetTextureProvider } from '../renderer/textures.ts'
import { createGameRenderer } from '../renderer/gameRenderer.ts'
import { loadGameBundle } from './bundle.ts'
import { createKeyboardInput, mergeInputs } from './input.ts'
import { createMessageBox } from './messageBox.ts'
import { TOUCH_CONTROLS_HEIGHT, createTouchControls, hasCoarsePointer } from './touchControls.ts'

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

    const showTouchControls =
      options.touchControls === 'on' ||
      (options.touchControls !== 'off' && hasCoarsePointer(window))

    root.style.position = 'relative'
    // The game's own area. In portrait it stops above the touch controls, so a thumb never
    // covers the picture; in landscape the controls float over the corners instead.
    const stage = root.ownerDocument.createElement('div')
    stage.style.cssText = 'position:absolute;left:0;right:0;top:0;bottom:0'
    const canvas = root.ownerDocument.createElement('canvas')
    canvas.style.cssText = 'display:block;width:100%;height:100%;image-rendering:pixelated'
    stage.append(canvas)
    root.replaceChildren(stage)

    const game = createGame({ project: loaded.project, audio })
    const plugins = createEnginePluginManager(game, { audio })
    loaded.plugins.forEach((registration) => plugins.register(registration))
    await plugins.initialize()

    const textures = createAssetTextureProvider({
      loadBlob: async (path) => {
        const response = await fetch(urlFor(path))
        if (!response.ok) throw new Error(`Could not load ${path} (${response.status})`)
        return response.blob()
      },
    })
    const renderer = await createGameRenderer({ canvas, game, textures, resizeTo: stage })
    const messageBox = createMessageBox(stage, game.bus)
    const keyboard = createKeyboardInput(window)
    const touch = showTouchControls ? createTouchControls(root) : null
    const input = touch ? mergeInputs(keyboard, touch) : keyboard

    const portrait =
      typeof window.matchMedia === 'function' ? window.matchMedia('(orientation: portrait)') : null
    const reserveControlsSpace = (): void => {
      stage.style.bottom = touch && portrait?.matches ? `${TOUCH_CONTROLS_HEIGHT}px` : '0'
      renderer.app.resize()
    }
    reserveControlsSpace()
    portrait?.addEventListener('change', reserveControlsSpace)
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
        portrait?.removeEventListener('change', reserveControlsSpace)
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
