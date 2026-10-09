// @vitest-environment jsdom
/* eslint-disable functional/immutable-data --
   The renderer and sound backend are test doubles that record what the session asks of them. */
import { type Project, createStarterProject } from '@rpgstudio/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { type Game } from '../src'
import { type SoundBackend } from '../src/audio'
import { type TextureProvider } from '../src/renderer'
import { type PlayerSession, createPlayerSession } from '../src/player'

const mocks = vi.hoisted(() => {
  const frames: Array<(frame: { deltaMS: number }) => void> = []
  const renderer = {
    app: {
      ticker: {
        add: vi.fn((frame: (frame: { deltaMS: number }) => void) => {
          frames.push(frame)
        }),
        remove: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      },
      render: vi.fn(),
      resize: vi.fn(),
    },
    render: vi.fn(),
    settled: vi.fn(() => Promise.resolve()),
    setGame: vi.fn(),
    destroy: vi.fn(),
  }
  return { frames, renderer }
})

vi.mock('../src/renderer/gameRenderer.ts', () => ({
  createGameRenderer: vi.fn(() => Promise.resolve(mocks.renderer)),
}))

const TICK_MS = 1000 / 60

const backend = (): SoundBackend => ({
  play: vi.fn(() => ({ stop: vi.fn(), setVolume: vi.fn() })),
  unlock: vi.fn(() => Promise.resolve()),
  pause: vi.fn(),
  resume: vi.fn(),
})

const textures: TextureProvider = {
  load: () => Promise.reject(new Error('not used: the renderer is faked')),
  get: () => undefined,
  invalidate: () => undefined,
}

const press = (target: EventTarget, code: string, init: KeyboardEventInit = {}) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { code, cancelable: true, ...init }))
const release = (target: EventTarget, code: string) =>
  target.dispatchEvent(new KeyboardEvent('keyup', { code, cancelable: true }))

/** Runs the loop the way the ticker would: `count` frames of exactly one tick each. */
const runTicks = (count: number): void => {
  for (let i = 0; i < count; i++) mocks.frames.forEach((frame) => frame({ deltaMS: TICK_MS }))
}

const starter = createStarterProject('Quest')
const movedStart = (project: Project): Project => ({
  ...project,
  meta: { ...project.meta, startX: 3, startY: 4 },
})

describe('player session', () => {
  let root: HTMLElement
  let stage: HTMLElement
  let sound: SoundBackend
  let session: PlayerSession | undefined

  const open = async (extra: Partial<Parameters<typeof createPlayerSession>[0]> = {}) => {
    session = await createPlayerSession({
      root,
      project: starter,
      listFiles: () => [],
      textures,
      soundBackend: sound,
      keyTarget: stage,
      touchControls: 'off',
      ...extra,
    })
    return session
  }

  beforeEach(() => {
    mocks.frames.length = 0
    vi.clearAllMocks()
    root = document.createElement('div')
    stage = document.createElement('div')
    document.body.append(root, stage)
    sound = backend()
  })

  afterEach(() => {
    session?.stop()
    session = undefined
    root.remove()
    stage.remove()
  })

  it('runs the simulation at fixed ticks and draws every frame', async () => {
    const opened = await open()
    expect(opened.paused).toBe(false)
    runTicks(3)
    expect(opened.game.state.tick).toBe(3)
    expect(mocks.renderer.render).toHaveBeenCalledTimes(3)
  })

  describe('the root element', () => {
    it('is made a positioning context when the page left it static', async () => {
      await open()
      expect(root.style.position).toBe('relative')
    })

    it('keeps the position its host chose, so the host’s layout is not collapsed', async () => {
      root.style.position = 'absolute'
      await open()
      expect(root.style.position).toBe('absolute')
    })
  })

  it('takes keys only from the key target, not the window', async () => {
    const opened = await open()
    press(window, 'ArrowRight')
    runTicks(30)
    expect(opened.game.snapshot().player).toMatchObject({ x: 10, y: 7 })
    press(stage, 'ArrowRight')
    runTicks(30)
    expect(opened.game.snapshot().player.x).toBeGreaterThan(10)
  })

  it('ignores a chord, so Ctrl+Z over the stage is left to the editor', async () => {
    const opened = await open()
    const event = new KeyboardEvent('keydown', { code: 'KeyZ', ctrlKey: true, cancelable: true })
    stage.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
    runTicks(2)
    expect(opened.game.state.message).toBeNull()
  })

  describe('pause and resume', () => {
    it('stops the ticker and freezes sound, and is idempotent', async () => {
      const opened = await open()
      opened.pause()
      opened.pause()
      expect(opened.paused).toBe(true)
      expect(mocks.renderer.app.ticker.stop).toHaveBeenCalledOnce()
      expect(sound.pause).toHaveBeenCalledOnce()
    })

    it('continues from the same tick, restarts the ticker and sound', async () => {
      const opened = await open()
      runTicks(5)
      opened.pause()
      opened.resume()
      opened.resume()
      expect(opened.paused).toBe(false)
      expect(mocks.renderer.app.ticker.start).toHaveBeenCalledOnce()
      expect(sound.resume).toHaveBeenCalledOnce()
      expect(opened.game.state.tick).toBe(5)
      runTicks(1)
      expect(opened.game.state.tick).toBe(6)
    })

    it('drops a tap made while paused instead of moving on return', async () => {
      const opened = await open()
      opened.pause()
      press(stage, 'ArrowRight')
      release(stage, 'ArrowRight')
      opened.resume()
      runTicks(30)
      expect(opened.game.snapshot().player).toMatchObject({ x: 10, y: 7 })
    })

    it('does not let the key that resumed the game count as a confirm', async () => {
      const opened = await open()
      opened.pause()
      press(stage, 'Enter')
      opened.resume()
      const polled = vi.spyOn(opened.game, 'tick')
      runTicks(1)
      expect(polled).toHaveBeenCalledWith({ direction: null, confirm: false })
    })

    it('keeps walking on return if the key is still held', async () => {
      const opened = await open()
      opened.pause()
      press(stage, 'ArrowRight')
      opened.resume()
      runTicks(30)
      expect(opened.game.snapshot().player.x).toBeGreaterThan(10)
    })

    it('can start paused, drawing one finished frame and never ticking', async () => {
      const opened = await open({ startPaused: true })
      expect(opened.paused).toBe(true)
      expect(mocks.renderer.app.ticker.stop).toHaveBeenCalledOnce()
      expect(mocks.renderer.settled).toHaveBeenCalled()
      expect(mocks.renderer.app.render).toHaveBeenCalledOnce()
    })
  })

  describe('a frame that throws', () => {
    const breakNextTick = (opened: PlayerSession): void => {
      vi.spyOn(opened.game, 'tick').mockImplementation(() => {
        throw new Error('Cannot transfer to map 9')
      })
    }

    it('pauses the game and reports the error instead of killing the ticker silently', async () => {
      const onError = vi.fn()
      const opened = await open({ onError })
      breakNextTick(opened)
      runTicks(1)
      expect(opened.paused).toBe(true)
      expect(mocks.renderer.app.ticker.stop).toHaveBeenCalledOnce()
      expect(onError).toHaveBeenCalledOnce()
      expect(String(onError.mock.calls[0]?.[0])).toMatch(/map 9/)
    })

    it('rethrows when nobody listens, after pausing', async () => {
      const opened = await open()
      breakNextTick(opened)
      expect(() => runTicks(1)).toThrow(/map 9/)
      expect(opened.paused).toBe(true)
    })
  })

  describe('reload', () => {
    it('replaces the game on the same renderer, starting from the new project', async () => {
      const opened = await open()
      const before = opened.game
      runTicks(4)
      const result = await opened.reload({ project: movedStart(starter) })
      expect(result).toEqual({ success: true, data: { restored: true } })
      expect(opened.game).not.toBe(before)
      expect(mocks.renderer.setGame).toHaveBeenCalledWith(opened.game)
      expect(opened.game.snapshot().player).toMatchObject({ x: 3, y: 4 })
    })

    it('carries on from a checkpoint when the new project allows it', async () => {
      const opened = await open()
      press(stage, 'ArrowRight')
      runTicks(30)
      release(stage, 'ArrowRight')
      runTicks(30) // settle on a tile
      const { x, y } = opened.game.snapshot().player
      expect(x).toBeGreaterThan(10)
      const result = await opened.reload({
        project: movedStart(starter),
        save: opened.game.serialize(),
      })
      expect(result.success).toBe(true)
      // The checkpoint's position wins over the new project's start tile.
      expect(opened.game.snapshot().player).toMatchObject({ x, y })
    })

    it('still replaces the game, from the start, when the checkpoint no longer fits', async () => {
      const opened = await open()
      const save = { ...opened.game.serialize(), mapId: 99 }
      const result = await opened.reload({ project: movedStart(starter), save })
      // The game was replaced, and the outcome says the place was not kept and why.
      expect(result.success).toBe(true)
      expect(result.success && result.data.restored).toBe(false)
      expect(result.success && result.data.reason).toBeTruthy()
      expect(opened.game.snapshot().player).toMatchObject({ x: 3, y: 4 })
    })

    it('keeps the old game running when the new one cannot be built', async () => {
      const opened = await open()
      const before = opened.game
      const broken = { ...starter, meta: { ...starter.meta, startMapId: 42 } }
      const result = await opened.reload({ project: broken })
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error).toMatch(/Start map 42/)
      expect(opened.game).toBe(before)
      expect(mocks.renderer.setGame).not.toHaveBeenCalled()
      runTicks(2)
      expect(before.state.tick).toBe(2)
    })

    it('shows messages from the new game and not the old one', async () => {
      const opened = await open()
      const old: Game = opened.game
      await opened.reload({ project: starter })
      const text = (value: string) => ({ face: undefined, text: value })
      old.bus.emit('message', text('from the old game'))
      expect(stage.querySelector('[role=status]')).toBeNull()
      expect(root.querySelector('[role=status]')?.textContent).toBe('')
      opened.game.bus.emit('message', text('from the new game'))
      expect(root.querySelector('[role=status]')?.textContent).toBe('from the new game')
    })

    it('redraws by hand when reloaded while paused', async () => {
      const opened = await open()
      opened.pause()
      await opened.reload({ project: starter })
      expect(mocks.renderer.app.render).toHaveBeenCalledOnce()
    })

    it('does not touch a stopped player when a reload finishes after stop()', async () => {
      const opened = await open()
      const pending = opened.reload({ project: starter })
      opened.stop()
      session = undefined
      const result = await pending
      expect(result.success).toBe(false)
      expect(mocks.renderer.setGame).not.toHaveBeenCalled()
    })

    it('runs overlapping reloads one at a time, in order', async () => {
      const opened = await open()
      const first = opened.reload({ project: movedStart(starter) })
      const second = opened.reload({ project: starter })
      await Promise.all([first, second])
      expect(mocks.renderer.setGame).toHaveBeenCalledTimes(2)
      expect(opened.game.snapshot().player).toMatchObject({ x: 10, y: 7 })
    })
  })

  it('leaves no window listener behind when the renderer cannot start', async () => {
    const { createGameRenderer } = await import('../src/renderer/gameRenderer.ts')
    vi.mocked(createGameRenderer).mockRejectedValueOnce(new Error('no WebGL'))
    const addListener = vi.spyOn(window, 'addEventListener')
    await expect(open()).rejects.toThrow('no WebGL')
    session = undefined
    expect(addListener).not.toHaveBeenCalled()
  })

  it('removes its listeners and destroys the renderer when stopped', async () => {
    const opened = await open()
    opened.stop()
    session = undefined
    expect(mocks.renderer.destroy).toHaveBeenCalledOnce()
    expect(mocks.renderer.app.ticker.remove).toHaveBeenCalledOnce()
    press(stage, 'Enter')
  })
})
