import { type PluginRegistration, type Project, type Unsubscribe } from '@rpgstudio/core'
import { type EngineCapabilities, type Game } from '@rpgstudio/engine'
import { type SoundBackend } from '@rpgstudio/engine/audio'
import {
  type PlayerSession,
  type PlayerSessionOptions,
  createPlayerSession,
} from '@rpgstudio/engine/player'
import { type TextureProvider } from '@rpgstudio/engine/renderer'

import {
  type PauseReason,
  type RunEvent,
  type RunState,
  initialRunState,
  isRunning,
  pauseReasons,
  reduceRun,
} from './previewControls.ts'
import { type PreviewInfo, readInfo, sameInfo } from './previewInfo.ts'
import { chooseCheckpoint, describeRestart } from './previewReload.ts'
import { type PreviewStart, applyStart } from './previewStart.ts'

type Plugins = readonly PluginRegistration<EngineCapabilities>[]

/** Everything the preview needs from the editor, so the controller can be tested without one. */
export interface PreviewHost {
  /** The project as it is now. */
  getProject: () => Project
  /**
   * A token that changes whenever the project or any of its files does (undo and asset writes
   * included). Two equal tokens mean the running game is current.
   */
  version: () => string
  /** Calls `listener` after the project or any file changed. */
  watch: (listener: () => void) => Unsubscribe
  /** Why this project cannot be played (the same list the exporter refuses with). */
  findProblems: (project: Project) => readonly string[]
  loadPlugins: (project: Project) => Promise<Plugins>
  listFiles: () => readonly string[]
  readonly textures: TextureProvider
  readonly soundBackend: SoundBackend
}

export interface Notice {
  readonly severity: 'warning' | 'error'
  readonly text: string
}

export interface PreviewState {
  /** `starting` until the first game is up; `failed` when none could be started. */
  readonly phase: 'starting' | 'ready' | 'failed'
  /** True only while the game is actually ticking. */
  readonly running: boolean
  readonly reasons: readonly PauseReason[]
  /** The project changed while the game was standing still; it catches up on resume. */
  readonly pendingChange: boolean
  /** What to tell the user about the last reload or a crash. */
  readonly notice: Notice | null
  /** Why the game cannot start (phase `failed`). */
  readonly problems: readonly string[]
  /** The game threw while running; it stays paused until Restart. */
  readonly crashed: boolean
  readonly keepPlace: boolean
  readonly start: PreviewStart | null
  readonly info: PreviewInfo | null
  /** How many times the running game was replaced (a reload or a restart) since the tab opened. */
  readonly reloads: number
}

export interface PreviewControllerOptions {
  readonly host: PreviewHost
  readonly keepPlace?: boolean
  readonly start?: PreviewStart | null
  /** Quiet time after an edit before the game is rebuilt, so a brush stroke reloads once. */
  readonly reloadDelayMs?: number
  /** How often the status readout is refreshed while the game runs. */
  readonly pollMs?: number
  /** Replaceable in tests; there is no WebGL in jsdom. */
  readonly createSession?: (options: PlayerSessionOptions) => Promise<PlayerSession>
  /** Where "the tab is hidden" is heard. Defaults to `document`. */
  readonly visibility?: Pick<Document, 'addEventListener' | 'removeEventListener' | 'hidden'>
}

export interface PreviewController {
  getState: () => PreviewState
  subscribe: (listener: () => void) => Unsubscribe
  /** Begins playing in `stage`, which must be focusable and is where key presses are heard. */
  attach: (stage: HTMLElement) => void
  /** Stops everything and frees the canvas. The controller can be attached again. */
  detach: () => void
  send: (event: RunEvent) => void
  /** Starts the game again from the beginning, optionally from a new start (null clears it). */
  restart: (start?: PreviewStart | null) => Promise<void>
  setKeepPlace: (keep: boolean) => void
  /**
   * Reads the game into `info` now. The readout is otherwise refreshed on a timer, so anything that
   * must be exact (the `GET_PREVIEW_STATE` query) calls this first.
   */
  refresh: () => void
}

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

const NO_PROBLEMS: readonly string[] = []

export const createPreviewController = (options: PreviewControllerOptions): PreviewController => {
  const {
    host,
    reloadDelayMs = 300,
    pollMs = 250,
    createSession = createPlayerSession,
    visibility = document,
  } = options

  let state: PreviewState = {
    phase: 'starting',
    running: false,
    reasons: pauseReasons(initialRunState),
    pendingChange: false,
    notice: null,
    problems: NO_PROBLEMS,
    crashed: false,
    keepPlace: options.keepPlace ?? true,
    start: options.start ?? null,
    info: null,
    reloads: 0,
  }
  let listeners: readonly (() => void)[] = []
  const publish = (patch: Partial<PreviewState>): void => {
    state = { ...state, ...patch }
    listeners.forEach((listener) => {
      listener()
    })
  }

  let run: RunState = initialRunState
  let session: PlayerSession | null = null
  /** Bumped by every attach/detach, so work that finishes after a detach knows it is stale. */
  let epoch = 0
  let stageElement: HTMLElement | null = null
  let appliedVersion = ''
  let reloadTimer: ReturnType<typeof setTimeout> | undefined
  let pollTimer: ReturnType<typeof setInterval> | undefined
  let cleanups: readonly (() => void)[] = []
  let remembered: unknown
  let unwatchGame: (() => void) | null = null
  let reloading = false
  let syncing = false
  let syncAgain = false

  const refreshInfo = (): void => {
    if (!session) return
    // A game that is crashed or mid-teardown may not be readable; keep the last good reading
    // rather than failing the poll or a `GET_PREVIEW_STATE` query.
    try {
      const info = readInfo(session.game)
      if (!sameInfo(state.info, info)) publish({ info })
    } catch {
      // The previous `info` stays.
    }
  }

  /** Keeps the last point a cutscene-free game could be saved at, for reloads that land mid-event. */
  const watchGame = (game: Game): void => {
    unwatchGame?.()
    unwatchGame = game.bus.on('stepped', ({ entity }) => {
      if (entity.kind === 'player' && game.canSave()) remembered = game.serialize()
    })
  }

  const stopPolling = (): void => {
    if (pollTimer !== undefined) clearInterval(pollTimer)
    pollTimer = undefined
  }

  const reasonsNow = (): readonly PauseReason[] => pauseReasons(run)

  /** Makes the session match the run state: the one place that pauses or resumes it. */
  const sync = async (): Promise<void> => {
    if (syncing) {
      syncAgain = true
      return
    }
    syncing = true
    try {
      do {
        syncAgain = false
        const current = session
        if (!current) break
        const wantRunning = isRunning(run) && !state.crashed
        if (wantRunning && current.paused) {
          // Catch up on edits made while standing still before the first tick, not after.
          if (host.version() !== appliedVersion) await reload()
          if (isRunning(run) && !state.crashed && session === current) current.resume()
        } else if (!wantRunning && !current.paused) {
          current.pause()
        }
        if (session !== current) continue
        const running = !current.paused
        stopPolling()
        if (running) pollTimer = setInterval(refreshInfo, pollMs)
        refreshInfo()
        publish({ running, reasons: reasonsNow() })
      } while (syncAgain)
    } finally {
      syncing = false
    }
  }

  const planReload = (): void => {
    clearTimeout(reloadTimer)
    reloadTimer = setTimeout(() => {
      // Paused in the meantime: leave the change for the resume, as promised.
      if (session?.paused) publish({ pendingChange: true })
      else void reload()
    }, reloadDelayMs)
  }

  /** Rebuilds the game from the project as it is now, keeping the player's place if asked to. */
  const reload = async (): Promise<void> => {
    const current = session
    if (!current || reloading) return
    reloading = true
    clearTimeout(reloadTimer)
    const myEpoch = epoch
    const version = host.version()
    try {
      const project = host.getProject()
      const problems = host.findProblems(project)
      if (problems.length > 0) {
        // Keep the old game; it is still the last good one. The next edit tries again.
        publish({
          pendingChange: false,
          notice: { severity: 'error', text: `Not reloaded. ${problems.join(' ')}` },
        })
        return
      }
      const plugins = await host.loadPlugins(project)
      if (myEpoch !== epoch) return
      const save = chooseCheckpoint(current.game, remembered, state.keepPlace)
      const result = await current.reload({
        project: applyStart(project, state.start),
        plugins,
        ...(save === undefined ? {} : { save }),
      })
      if (myEpoch !== epoch) return
      if (!result.success) {
        // The old game is still running; the next edit tries again.
        publish({
          pendingChange: false,
          notice: { severity: 'error', text: `Not reloaded. ${result.error}` },
        })
      } else {
        appliedVersion = version
        publish({
          pendingChange: false,
          crashed: false,
          reloads: state.reloads + 1,
          notice: result.data.restored
            ? null
            : {
                severity: 'warning',
                text: describeRestart(result.data.reason ?? 'it no longer fits'),
              },
        })
      }
      watchGame(current.game)
      refreshInfo()
    } catch (error) {
      if (myEpoch === epoch) {
        publish({
          pendingChange: false,
          notice: { severity: 'error', text: `Not reloaded. ${messageOf(error)}` },
        })
      }
    } finally {
      reloading = false
    }
    // Edits that arrived while rebuilding: go again.
    if (myEpoch === epoch && host.version() !== appliedVersion && isRunning(run)) planReload()
  }

  const onProjectChanged = (): void => {
    if (state.phase === 'failed') {
      clearTimeout(reloadTimer)
      reloadTimer = setTimeout(() => {
        void begin()
      }, reloadDelayMs)
      return
    }
    if (!session || host.version() === appliedVersion) return
    if (session.paused) {
      publish({ pendingChange: true })
      return
    }
    planReload()
  }

  const begin = async (): Promise<void> => {
    const stage = stageElement
    if (!stage) return
    const myEpoch = epoch
    // Read before anything is awaited, so an edit made while starting is noticed afterwards.
    const version = host.version()
    const project = host.getProject()
    const problems = host.findProblems(project)
    if (problems.length > 0) {
      publish({ phase: 'failed', problems, notice: null, running: false })
      return
    }
    try {
      const plugins = await host.loadPlugins(project)
      const created = await createSession({
        root: stage,
        project: applyStart(project, state.start),
        plugins,
        listFiles: host.listFiles,
        textures: host.textures,
        soundBackend: host.soundBackend,
        keyTarget: stage,
        touchControls: 'auto',
        startPaused: true,
        onError: (error) => {
          publish({
            crashed: true,
            running: false,
            notice: { severity: 'error', text: `The game stopped: ${error.message}` },
          })
          void sync()
        },
      })
      if (myEpoch !== epoch) {
        created.stop()
        return
      }
      session = created
      appliedVersion = version
      remembered = undefined
      watchGame(created.game)
      publish({ phase: 'ready', problems: NO_PROBLEMS, crashed: false, notice: null })
      await sync()
      if (host.version() !== version) onProjectChanged()
    } catch (error) {
      if (myEpoch === epoch) {
        publish({ phase: 'failed', problems: [messageOf(error)], running: false })
      }
    }
  }

  const detach = (): void => {
    epoch += 1
    clearTimeout(reloadTimer)
    stopPolling()
    unwatchGame?.()
    unwatchGame = null
    cleanups.forEach((cleanup) => {
      cleanup()
    })
    cleanups = []
    session?.stop()
    session = null
    stageElement = null
    reloading = false
    run = initialRunState
    publish({
      phase: 'starting',
      running: false,
      reasons: reasonsNow(),
      pendingChange: false,
      info: null,
      notice: null,
      crashed: false,
      reloads: 0,
    })
  }

  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners = [...listeners, listener]
      return () => {
        listeners = listeners.filter((candidate) => candidate !== listener)
      }
    },
    attach: (stage) => {
      detach()
      stageElement = stage
      run = reduceRun(initialRunState, visibility.hidden ? 'tabHidden' : 'tabShown')
      const onVisibility = (): void => {
        send(visibility.hidden ? 'tabHidden' : 'tabShown')
      }
      visibility.addEventListener('visibilitychange', onVisibility)
      cleanups = [
        () => {
          visibility.removeEventListener('visibilitychange', onVisibility)
        },
        host.watch(onProjectChanged),
      ]
      publish({ reasons: reasonsNow() })
      void begin()
    },
    detach,
    send: (event) => {
      send(event)
    },
    restart: async (start) => {
      // Remembered even with no game yet, so a game that starts later starts there.
      if (start !== undefined) publish({ start })
      const current = session
      if (!current) return
      const myEpoch = epoch
      const version = host.version()
      const project = host.getProject()
      const problems = host.findProblems(project)
      if (problems.length > 0) {
        publish({ notice: { severity: 'error', text: `Not restarted. ${problems.join(' ')}` } })
        return
      }
      try {
        const result = await current.reload({
          project: applyStart(project, state.start),
          plugins: await host.loadPlugins(project),
        })
        if (myEpoch !== epoch) return
        if (!result.success) {
          publish({ notice: { severity: 'error', text: `Not restarted. ${result.error}` } })
          return
        }
        // Starting over always starts over, so there is no place to be refused here.
        appliedVersion = version
        remembered = undefined
        watchGame(current.game)
        publish({ crashed: false, notice: null, pendingChange: false, reloads: state.reloads + 1 })
        await sync()
      } catch (error) {
        if (myEpoch === epoch) {
          publish({ notice: { severity: 'error', text: `Not restarted. ${messageOf(error)}` } })
        }
      }
    },
    setKeepPlace: (keep) => {
      publish({ keepPlace: keep })
    },
    refresh: refreshInfo,
  }

  function send(event: RunEvent): void {
    run = reduceRun(run, event)
    publish({ reasons: reasonsNow() })
    void sync()
  }
}
