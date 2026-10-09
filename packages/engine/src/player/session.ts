import { type PluginRegistration, type Project, type Result, fail, ok } from '@rpgstudio/core'

import { type SoundBackend } from '../audio/manager.ts'
import { createAudioManager, createAudioPathResolver, installAudioUnlock } from '../audio/index.ts'
import { type UnlockTarget } from '../audio/unlock.ts'
import { createFixedStepClock } from '../game/clock.ts'
import { type Game, createGame } from '../game/game.ts'
import { type EngineCapabilities, createEnginePluginManager } from '../plugins/host.ts'
import { createGameRenderer } from '../renderer/gameRenderer.ts'
import { type TextureProvider } from '../renderer/textures.ts'
import { type KeyTarget, createKeyboardInput, mergeInputs } from './input.ts'
import { createMessageBox } from './messageBox.ts'
import { TOUCH_CONTROLS_HEIGHT, createTouchControls, hasCoarsePointer } from './touchControls.ts'

type Plugins = readonly PluginRegistration<EngineCapabilities>[]

export interface PlayerSessionOptions {
  /** Where the game is drawn. The session fills it with its own stage and canvas. */
  readonly root: HTMLElement
  /** A validated project. */
  readonly project: Project
  readonly plugins?: Plugins
  /**
   * Every project path the game may load. Audio cues are looked up in it, and it is asked
   * again for each cue so files added while the game runs are found.
   */
  readonly listFiles: () => readonly string[]
  readonly textures: TextureProvider
  readonly soundBackend: SoundBackend
  /** Who receives key presses. Defaults to `window`; the editor passes the focusable stage. */
  readonly keyTarget?: KeyTarget
  /** Where the first gesture that unlocks audio is heard. Defaults to `window`. */
  readonly unlockTarget?: UnlockTarget
  /**
   * On-screen D-pad and action button. `auto` (the default) shows them on touch screens
   * only; `on` and `off` force them.
   */
  readonly touchControls?: 'auto' | 'on' | 'off'
  readonly seed?: number
  /** Build the session without running it; call `resume()` to start. */
  readonly startPaused?: boolean
}

export interface ReloadOptions {
  readonly project: Project
  readonly plugins?: Plugins
  /** A `Game.serialize()` result to continue from. Without one the new game starts from the beginning. */
  readonly save?: unknown
}

export interface PlayerSession {
  /** The game now running. It is a different object after every `reload`. */
  readonly game: Game
  readonly paused: boolean
  /**
   * Stops the clock, the simulation and all sound, and leaves the last frame on screen. Costs
   * almost nothing while paused. Idempotent.
   */
  pause: () => void
  /** Continues from exactly where `pause` stopped; key presses made meanwhile are dropped. */
  resume: () => void
  /**
   * Replaces the running game with one built from `project`, on the same canvas and without
   * restarting the music. Reloads queue and run one at a time.
   *
   * Fails only if the new game cannot be built or its plugins cannot start; the old game then
   * keeps running. If `save` is refused by the new project, the game is still replaced and
   * starts from the beginning, and the result is a failure that says why.
   */
  reload: (options: ReloadOptions) => Promise<Result<undefined>>
  stop: () => void
}

/**
 * Boots a game inside `root`: audio (unlocked by the first gesture), the PixiJS renderer, the
 * message box, keyboard and touch input, engine plugins, and a loop that advances the
 * simulation at a fixed 60 ticks per second.
 *
 * Everything environmental is a parameter, so the same code runs an exported game (data fetched
 * over HTTP, `window` for keys) and the editor's live preview (data from memory, keys only while
 * the stage has focus). It throws if it cannot start.
 */
export const createPlayerSession = async (
  options: PlayerSessionOptions,
): Promise<PlayerSession> => {
  const { root, textures, soundBackend } = options
  const doc = root.ownerDocument
  const keyTarget = options.keyTarget ?? window
  const unlockTarget = options.unlockTarget ?? window

  const audio = createAudioManager({
    backend: soundBackend,
    resolvePath: (tier, name) => createAudioPathResolver(options.listFiles())(tier, name),
  })

  const showTouchControls =
    options.touchControls === 'on' || (options.touchControls !== 'off' && hasCoarsePointer(window))

  root.style.position = 'relative'
  // The game's own area. In portrait it stops above the touch controls, so a thumb never
  // covers the picture; in landscape the controls float over the corners instead.
  const stage = doc.createElement('div')
  stage.style.cssText = 'position:absolute;left:0;right:0;top:0;bottom:0'
  const canvas = doc.createElement('canvas')
  canvas.style.cssText = 'display:block;width:100%;height:100%;image-rendering:pixelated'
  stage.append(canvas)
  root.replaceChildren(stage)

  /** A game plus the plugin manager that is bound to it. */
  const start = async (
    project: Project,
    plugins: Plugins,
  ): Promise<{ game: Game; teardown: () => Promise<void> }> => {
    const game = createGame({
      project,
      audio,
      ...(options.seed === undefined ? {} : { seed: options.seed }),
    })
    const manager = createEnginePluginManager(game, { audio })
    plugins.forEach((registration) => manager.register(registration))
    try {
      await manager.initialize()
    } catch (error) {
      await manager.teardown()
      throw error
    }
    return { game, teardown: () => manager.teardown() }
  }

  let current = await start(options.project, options.plugins ?? [])
  const renderer = await createGameRenderer({
    canvas,
    game: current.game,
    textures,
    resizeTo: stage,
  }).catch(async (error: unknown) => {
    await current.teardown() // the plugins are running; do not leave them behind
    throw error
  })
  // Nothing below can throw, so a failure above leaves no listener behind.
  const stopUnlock = installAudioUnlock(unlockTarget, () => audio.unlock())
  let messageBox = createMessageBox(stage, current.game.bus)
  const keyboard = createKeyboardInput(keyTarget)
  const touch = showTouchControls ? createTouchControls(root) : null
  const input = touch ? mergeInputs(keyboard, touch) : keyboard
  const clock = createFixedStepClock()
  let paused = false
  let stopped = false

  /**
   * Draws a complete frame by hand. A paused game needs this after anything that changes the
   * picture (a resize, a reload), because the ticker that normally draws is stopped. Tiles and
   * sprite sheets load asynchronously, so it waits for them before the final draw.
   */
  const redraw = async (): Promise<void> => {
    renderer.render()
    await renderer.settled()
    if (stopped) return
    renderer.render()
    renderer.app.render()
  }

  const portrait =
    typeof window.matchMedia === 'function' ? window.matchMedia('(orientation: portrait)') : null
  const reserveControlsSpace = (): void => {
    stage.style.bottom = touch && portrait?.matches ? `${TOUCH_CONTROLS_HEIGHT}px` : '0'
    renderer.app.resize()
    if (paused) void redraw()
  }
  reserveControlsSpace()
  portrait?.addEventListener('change', reserveControlsSpace)

  // PixiJS only follows the window, but the editor's stage changes size when a dock is dragged.
  const observer =
    typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => {
          renderer.app.resize()
          if (paused) void redraw()
        })
      : null
  observer?.observe(stage)

  const onFrame = ({ deltaMS }: { deltaMS: number }): void => {
    const ticks = clock.advance(deltaMS)
    for (let i = 0; i < ticks; i++) current.game.tick(input.poll())
    renderer.render()
  }
  renderer.app.ticker.add(onFrame)

  const pause = (): void => {
    if (paused) return
    paused = true
    renderer.app.ticker.stop()
    audio.pauseAll()
  }

  const resume = (): void => {
    if (!paused) return
    paused = false
    // Presses made while paused (keys held, a latched tap) must not move the player on return.
    input.poll()
    clock.reset()
    audio.resumeAll()
    renderer.app.ticker.start()
  }
  if (options.startPaused) {
    paused = true
    renderer.app.ticker.stop()
    await redraw()
  }

  const swap = async ({
    project,
    plugins = [],
    save,
  }: ReloadOptions): Promise<Result<undefined>> => {
    let next: Awaited<ReturnType<typeof start>>
    try {
      next = await start(project, plugins)
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error))
    }
    if (stopped) {
      await next.teardown() // the player was stopped while this game was starting
      return fail('The player was stopped')
    }
    const restored = save === undefined ? ok(undefined) : next.game.restore(save)

    const previous = current
    current = next
    renderer.setGame(next.game)
    messageBox.dispose()
    messageBox = createMessageBox(stage, next.game.bus)
    void previous.teardown()
    if (paused) await redraw()
    return restored
  }

  /** Reloads run one after another, so a second request never races the first. */
  let queue: Promise<unknown> = Promise.resolve()
  const reload: PlayerSession['reload'] = (reloadOptions) => {
    const run = queue.then(() => swap(reloadOptions))
    queue = run.catch(() => undefined)
    return run
  }

  return {
    get game() {
      return current.game
    },
    get paused() {
      return paused
    },
    pause,
    resume,
    reload,
    stop: () => {
      stopped = true
      renderer.app.ticker.remove(onFrame)
      observer?.disconnect()
      stopUnlock()
      portrait?.removeEventListener('change', reserveControlsSpace)
      input.dispose()
      messageBox.dispose()
      audio.stopAll()
      void current.teardown()
      renderer.destroy()
    },
  }
}
