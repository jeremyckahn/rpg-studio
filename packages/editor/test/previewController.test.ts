// @vitest-environment jsdom
/* eslint-disable functional/immutable-data --
   The session, game and host are test doubles that record calls and let a test change what they report. */
import { type Project, createEventBus, createStarterProject } from '@rpgstudio/core'
import { type PlayerSession, type PlayerSessionOptions } from '@rpgstudio/engine/player'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { type PreviewHost, createPreviewController } from '../src/preview/previewController'
import { describePreview } from '../src/preview/previewHub'

const project = createStarterProject('Quest')

/** A game that reports what the controller reads and records what it was asked. */
const fakeGame = (name = 'one') => {
  const bus = createEventBus<{ stepped: { entity: { kind: string } } }>()
  return {
    name,
    bus,
    canSaveNow: true,
    canSave() {
      return this.canSaveNow
    },
    serialize: vi.fn(() => ({ saved: name })),
    snapshot: () => ({
      tick: 7,
      mapId: 1,
      player: { x: 10, y: 7, direction: 'down', moving: false },
      switches: {},
      variables: {},
      message: null,
      eventRunning: false,
    }),
    state: { map: { name: 'Village' }, gold: 5, party: [], inventory: {} },
  }
}

const fakeSession = (startPaused: boolean) => {
  let game = fakeGame('one')
  const session = {
    paused: startPaused,
    get game() {
      return game as never
    },
    pause: vi.fn(() => {
      session.paused = true
    }),
    resume: vi.fn(() => {
      session.paused = false
    }),
    reload: vi.fn((_options: unknown) => {
      game = fakeGame('two')
      return Promise.resolve({ success: true as const, data: { restored: true } })
    }),
    stop: vi.fn(),
  }
  return session
}

type FakeSession = ReturnType<typeof fakeSession>

const setup = (overrides: { problems?: readonly string[] } = {}) => {
  let version = 1
  let listener: () => void = () => undefined
  let current: Project = project
  const sessions: FakeSession[] = []
  let problems: readonly string[] = overrides.problems ?? []
  const host: PreviewHost = {
    getProject: () => current,
    version: () => String(version),
    watch: (next) => {
      listener = next
      return () => {
        listener = () => undefined
      }
    },
    findProblems: () => problems,
    loadPlugins: () => Promise.resolve([]),
    listFiles: () => [],
    textures: {
      load: () => Promise.reject(new Error('unused')),
      get: () => undefined,
      invalidate: vi.fn(),
    },
    soundBackend: { play: vi.fn(), unlock: vi.fn(), pause: vi.fn(), resume: vi.fn() },
  }
  const createSession = vi.fn((options: PlayerSessionOptions): Promise<PlayerSession> => {
    const made = fakeSession(options.startPaused === true)
    sessions.push(made)
    return Promise.resolve(made as unknown as PlayerSession)
  })
  const visibility = Object.assign(new EventTarget(), { hidden: false })
  const controller = createPreviewController({
    host,
    createSession,
    visibility: visibility,
    reloadDelayMs: 300,
    pollMs: 250,
  })
  const stage = document.createElement('div')
  return {
    controller,
    stage,
    createSession,
    sessions,
    visibility,
    edit: () => {
      version += 1
      listener()
    },
    setProblems: (next: readonly string[]) => {
      problems = next
    },
    setProject: (next: Project) => {
      current = next
    },
    session: () => sessions.at(-1) as FakeSession,
  }
}

const flush = async (): Promise<void> => {
  await vi.advanceTimersByTimeAsync(0)
}

const started = async (overrides?: Parameters<typeof setup>[0]) => {
  const rig = setup(overrides)
  rig.controller.attach(rig.stage)
  await flush()
  return rig
}

const play = async (rig: Awaited<ReturnType<typeof started>>) => {
  rig.controller.send('focusEntered')
  await flush()
}

describe('preview controller', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  describe('starting', () => {
    it('builds a paused game on the stage, with the stage as the key target', async () => {
      const rig = await started()
      expect(rig.createSession).toHaveBeenCalledOnce()
      const options = rig.createSession.mock.calls[0]?.[0]
      expect(options?.root).toBe(rig.stage)
      expect(options?.keyTarget).toBe(rig.stage)
      expect(options?.startPaused).toBe(true)
      expect(rig.controller.getState()).toMatchObject({ phase: 'ready', running: false })
      expect(rig.controller.getState().reasons).toEqual(['focus'])
    })

    it('does not run until the game has focus', async () => {
      const rig = await started()
      expect(rig.session().resume).not.toHaveBeenCalled()
      await play(rig)
      expect(rig.session().resume).toHaveBeenCalledOnce()
      expect(rig.controller.getState()).toMatchObject({ running: true, reasons: [] })
    })

    it('shows the problems instead of a blank screen when the project cannot be played', async () => {
      const rig = await started({ problems: ['Plugin "acme.ghost" is enabled but missing'] })
      expect(rig.createSession).not.toHaveBeenCalled()
      expect(rig.controller.getState()).toMatchObject({
        phase: 'failed',
        problems: ['Plugin "acme.ghost" is enabled but missing'],
      })
    })

    it('starts by itself once the problem is fixed', async () => {
      const rig = await started({ problems: ['A map uses img/tilesets/basic.png'] })
      rig.setProblems([])
      rig.edit()
      await vi.advanceTimersByTimeAsync(300)
      expect(rig.createSession).toHaveBeenCalledOnce()
      expect(rig.controller.getState().phase).toBe('ready')
    })

    it('reports a session that cannot start as a failure with the reason', async () => {
      const rig = setup()
      rig.createSession.mockRejectedValueOnce(new Error('WebGL is not available'))
      rig.controller.attach(rig.stage)
      await flush()
      expect(rig.controller.getState()).toMatchObject({
        phase: 'failed',
        problems: ['WebGL is not available'],
      })
    })

    it('stops a game that finished starting after the panel was already closed', async () => {
      const rig = setup()
      rig.controller.attach(rig.stage)
      rig.controller.detach()
      await flush()
      expect(rig.session().stop).toHaveBeenCalledOnce()
      expect(rig.controller.getState().phase).toBe('starting')
    })
  })

  describe('pause and resume', () => {
    it('pauses on the user pause, on losing focus, and when the tab is hidden', async () => {
      const rig = await started()
      await play(rig)
      rig.controller.send('userPaused')
      await flush()
      expect(rig.controller.getState()).toMatchObject({ running: false, reasons: ['user'] })
      expect(rig.session().pause).toHaveBeenCalledOnce()
    })

    it('pauses when the browser tab is hidden and does not resume a user pause when it returns', async () => {
      const rig = await started()
      await play(rig)
      rig.controller.send('userPaused')
      rig.visibility.hidden = true
      rig.visibility.dispatchEvent(new Event('visibilitychange'))
      rig.visibility.hidden = false
      rig.visibility.dispatchEvent(new Event('visibilitychange'))
      await flush()
      expect(rig.controller.getState().reasons).toEqual(['user'])
      expect(rig.session().paused).toBe(true)
    })

    it('resumes with one user resume, whatever paused it', async () => {
      const rig = await started()
      await play(rig)
      rig.controller.send('userPaused')
      rig.controller.send('focusLeft')
      rig.controller.send('userResumed')
      await flush()
      expect(rig.session().paused).toBe(false)
      expect(rig.controller.getState().running).toBe(true)
    })

    it('opens with the tab already hidden as a pause reason', async () => {
      const rig = setup()
      rig.visibility.hidden = true
      rig.controller.attach(rig.stage)
      await flush()
      rig.controller.send('focusEntered')
      await flush()
      expect(rig.controller.getState().reasons).toEqual(['hidden'])
    })

    it('polls the readout only while running', async () => {
      const rig = await started()
      expect(rig.controller.getState().info).toMatchObject({ tick: 7, mapName: 'Village', gold: 5 })
      await play(rig)
      const seen = vi.fn()
      rig.controller.subscribe(seen)
      await vi.advanceTimersByTimeAsync(1000)
      // Nothing changed in the fake game, so a poll publishes nothing.
      expect(seen).not.toHaveBeenCalled()
      rig.controller.send('userPaused')
      await flush()
      const callsWhenPaused = seen.mock.calls.length
      await vi.advanceTimersByTimeAsync(1000)
      expect(seen.mock.calls.length).toBe(callsWhenPaused)
    })
  })

  describe('live reload', () => {
    it('rebuilds once, after a quiet moment, however many edits arrive', async () => {
      const rig = await started()
      await play(rig)
      rig.edit()
      await vi.advanceTimersByTimeAsync(100)
      rig.edit()
      await vi.advanceTimersByTimeAsync(100)
      rig.edit()
      expect(rig.session().reload).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(300)
      expect(rig.session().reload).toHaveBeenCalledOnce()
    })

    it('keeps the player’s place by default', async () => {
      const rig = await started()
      await play(rig)
      rig.edit()
      await vi.advanceTimersByTimeAsync(300)
      const options = rig.session().reload.mock.calls[0]?.[0] as { save?: unknown }
      expect(options.save).toEqual({ saved: 'one' })
    })

    it('starts again from the beginning when keeping the place is switched off', async () => {
      const rig = await started()
      await play(rig)
      rig.controller.setKeepPlace(false)
      rig.edit()
      await vi.advanceTimersByTimeAsync(300)
      const options = rig.session().reload.mock.calls[0]?.[0] as { save?: unknown }
      expect(options.save).toBeUndefined()
    })

    it('uses the last checkpoint when a cutscene is running and the game cannot be saved', async () => {
      const rig = await started()
      await play(rig)
      const game = rig.session().game as unknown as ReturnType<typeof fakeGame>
      game.bus.emit('stepped', { entity: { kind: 'player' } })
      game.canSaveNow = false
      game.serialize.mockClear()
      rig.edit()
      await vi.advanceTimersByTimeAsync(300)
      const options = rig.session().reload.mock.calls[0]?.[0] as { save?: unknown }
      expect(options.save).toEqual({ saved: 'one' })
      expect(game.serialize).not.toHaveBeenCalled()
    })

    it('says so when the new project could not take the player’s place', async () => {
      const rig = await started()
      await play(rig)
      rig.session().reload.mockResolvedValueOnce({
        success: true,
        data: { restored: false, reason: 'Map 3 does not exist.' },
      } as never)
      rig.edit()
      await vi.advanceTimersByTimeAsync(300)
      expect(rig.controller.getState().notice).toEqual({
        severity: 'warning',
        text: 'Restarted from the beginning: Map 3 does not exist.',
      })
    })

    it('keeps the old game and names the problem when the new project cannot be played', async () => {
      const rig = await started()
      await play(rig)
      rig.setProblems(['A map uses img/tilesets/gone.png, which is not in the project'])
      rig.edit()
      await vi.advanceTimersByTimeAsync(300)
      expect(rig.session().reload).not.toHaveBeenCalled()
      expect(rig.controller.getState().notice?.severity).toBe('error')
      expect(rig.controller.getState().notice?.text).toMatch(/gone\.png/)
    })

    it('clears the notice after the next good reload', async () => {
      const rig = await started()
      await play(rig)
      rig.setProblems(['broken'])
      rig.edit()
      await vi.advanceTimersByTimeAsync(300)
      rig.setProblems([])
      rig.edit()
      await vi.advanceTimersByTimeAsync(300)
      expect(rig.controller.getState().notice).toBeNull()
    })

    it('reports a reload that fails and carries on with the old game', async () => {
      const rig = await started()
      await play(rig)
      rig.session().reload.mockResolvedValueOnce({
        success: false,
        error: 'Start map 9 does not exist',
      } as never)
      rig.edit()
      await vi.advanceTimersByTimeAsync(300)
      expect(rig.controller.getState().notice?.text).toBe(
        'Not reloaded. Start map 9 does not exist',
      )
      expect(rig.controller.getState().running).toBe(true)
    })

    it('counts each time the game is replaced, so a test or an agent can tell its edit landed', async () => {
      const rig = await started()
      await play(rig)
      expect(rig.controller.getState().reloads).toBe(0)
      rig.edit()
      await vi.advanceTimersByTimeAsync(300)
      expect(rig.controller.getState().reloads).toBe(1)
      await rig.controller.restart()
      expect(rig.controller.getState().reloads).toBe(2)
    })

    it('does not count a reload that was refused', async () => {
      const rig = await started()
      await play(rig)
      rig.setProblems(['broken'])
      rig.edit()
      await vi.advanceTimersByTimeAsync(300)
      expect(rig.controller.getState().reloads).toBe(0)
    })

    it('does nothing when the version did not change', async () => {
      const rig = await started()
      await play(rig)
      rig.edit()
      await vi.advanceTimersByTimeAsync(300)
      expect(rig.session().reload).toHaveBeenCalledOnce()
    })
  })

  describe('edits while paused', () => {
    it('waits, says there is a change, and applies it once on resume before the first tick', async () => {
      const rig = await started()
      await play(rig)
      rig.controller.send('userPaused')
      await flush()
      rig.edit()
      rig.edit()
      rig.edit()
      await vi.advanceTimersByTimeAsync(2000)
      expect(rig.session().reload).not.toHaveBeenCalled()
      expect(rig.controller.getState().pendingChange).toBe(true)

      const order: string[] = []
      rig.session().reload.mockImplementationOnce(() => {
        order.push('reload')
        return Promise.resolve({ success: true as const, data: { restored: true } })
      })
      rig.session().resume.mockImplementationOnce(() => {
        order.push('resume')
        rig.session().paused = false
      })
      rig.controller.send('userResumed')
      await flush()
      expect(order).toEqual(['reload', 'resume'])
      expect(rig.session().reload).toHaveBeenCalledOnce()
      expect(rig.controller.getState().pendingChange).toBe(false)
    })

    it('does not reload a game that was paused while the quiet moment was running out', async () => {
      const rig = await started()
      await play(rig)
      rig.edit()
      await vi.advanceTimersByTimeAsync(100)
      rig.controller.send('userPaused')
      await vi.advanceTimersByTimeAsync(1000)
      expect(rig.session().reload).not.toHaveBeenCalled()
      expect(rig.controller.getState().pendingChange).toBe(true)
    })

    it('does not reload for a game that was never edited', async () => {
      const rig = await started()
      await play(rig)
      rig.controller.send('userPaused')
      rig.controller.send('userResumed')
      await flush()
      expect(rig.session().reload).not.toHaveBeenCalled()
    })
  })

  describe('restart and the game crashing', () => {
    it('starts again from the project start, with no place to keep', async () => {
      const rig = await started()
      await play(rig)
      await rig.controller.restart()
      const options = rig.session().reload.mock.calls[0]?.[0] as { save?: unknown }
      expect(options.save).toBeUndefined()
    })

    it('plays from a chosen tile and remembers it for later reloads', async () => {
      const rig = await started()
      await play(rig)
      await rig.controller.restart({ mapId: 1, x: 3, y: 4 })
      const first = rig.session().reload.mock.calls[0]?.[0] as { project: Project }
      expect(first.project.meta).toMatchObject({ startX: 3, startY: 4 })
      rig.controller.setKeepPlace(false)
      rig.edit()
      await vi.advanceTimersByTimeAsync(300)
      const second = rig.session().reload.mock.calls[1]?.[0] as { project: Project }
      expect(second.project.meta).toMatchObject({ startX: 3, startY: 4 })
    })

    it('clears the chosen tile when asked to', async () => {
      const rig = await started()
      await rig.controller.restart({ mapId: 1, x: 3, y: 4 })
      await rig.controller.restart(null)
      const last = rig.session().reload.mock.calls.at(-1)?.[0] as { project: Project }
      expect(last.project.meta).toMatchObject({ startX: 10, startY: 7 })
      expect(rig.controller.getState().start).toBeNull()
    })

    it('keeps a chosen start for a game that cannot start yet, and uses it once it can', async () => {
      const rig = await started({ problems: ['A map uses img/tilesets/basic.png'] })
      await rig.controller.restart({ mapId: 1, x: 3, y: 4 })
      expect(rig.controller.getState().start).toEqual({ mapId: 1, x: 3, y: 4 })
      rig.setProblems([])
      rig.edit()
      await vi.advanceTimersByTimeAsync(300)
      const options = rig.createSession.mock.calls[0]?.[0]
      expect(options?.project.meta).toMatchObject({ startX: 3, startY: 4 })
    })

    it('stays paused after the game throws, until Restart', async () => {
      const rig = await started()
      await play(rig)
      const options = rig.createSession.mock.calls[0]?.[0]
      rig.session().paused = true
      options?.onError?.(new Error('Cannot transfer to map 9'))
      await flush()
      expect(rig.controller.getState()).toMatchObject({ running: false, crashed: true })
      expect(rig.controller.getState().notice?.text).toBe(
        'The game stopped: Cannot transfer to map 9',
      )
      rig.controller.send('userResumed')
      await flush()
      expect(rig.session().resume).toHaveBeenCalledOnce() // only the first play(), not the crash
      await rig.controller.restart()
      expect(rig.controller.getState().crashed).toBe(false)
      expect(rig.controller.getState().running).toBe(true)
    })
  })

  describe('reading the game now', () => {
    it('refresh() reads the game at once instead of waiting for the next poll', async () => {
      const rig = await started()
      await play(rig)
      const game = rig.session().game as unknown as ReturnType<typeof fakeGame>
      game.state.gold = 99
      // The poll runs every 250 ms; before it does, the readout still shows the old value.
      expect(rig.controller.getState().info?.gold).toBe(5)
      rig.controller.refresh()
      expect(rig.controller.getState().info?.gold).toBe(99)
    })

    it('does nothing before there is a game', () => {
      const rig = setup()
      expect(() => {
        rig.controller.refresh()
      }).not.toThrow()
      expect(rig.controller.getState().info).toBeNull()
    })

    it('describePreview, which answers GET_PREVIEW_STATE, reads fresh data rather than the last poll', async () => {
      const rig = await started()
      await play(rig)
      const game = rig.session().game as unknown as ReturnType<typeof fakeGame>
      game.state.gold = 42
      const report = describePreview(rig.controller) as { game: { gold: number } }
      expect(report.game.gold).toBe(42)
    })
  })

  describe('closing the panel', () => {
    it('stops the game, stops listening and forgets the run state', async () => {
      const rig = await started()
      await play(rig)
      const session = rig.session()
      rig.controller.detach()
      expect(session.stop).toHaveBeenCalledOnce()
      rig.edit()
      await vi.advanceTimersByTimeAsync(1000)
      expect(session.reload).not.toHaveBeenCalled()
      expect(rig.controller.getState()).toMatchObject({ phase: 'starting', running: false })
    })

    it('can be attached again, as React’s strict mode does', async () => {
      const rig = await started()
      rig.controller.detach()
      rig.controller.attach(rig.stage)
      await flush()
      expect(rig.createSession).toHaveBeenCalledTimes(2)
      expect(rig.controller.getState().phase).toBe('ready')
    })
  })
})
