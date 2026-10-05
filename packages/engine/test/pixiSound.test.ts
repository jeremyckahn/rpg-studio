// @vitest-environment jsdom
/* eslint-disable functional/immutable-data --
   This file fakes @pixi/sound, which is a mutable singleton, so the fake mutates too. */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const added = new Map<
    string,
    { volume: number; options: Record<string, unknown>; legacy: boolean }
  >()
  const library = {
    useLegacy: false,
    context: { audioContext: { resume: vi.fn(() => Promise.resolve()) } },
    add: vi.fn((alias: string, options: Record<string, unknown>) => {
      const entry = { volume: options['volume'] as number, options, legacy: library.useLegacy }
      added.set(alias, entry)
      return entry
    }),
    exists: vi.fn((alias: string) => added.has(alias)),
    remove: vi.fn((alias: string) => added.delete(alias)),
  }
  return { added, library }
})

vi.mock('@pixi/sound', () => ({ sound: mocks.library }))

import { createPixiSoundBackend } from '../src/audio'

const request = (overrides: Record<string, unknown> = {}) => ({
  path: 'audio/se/coin.ogg',
  loop: false,
  volume: 0.8,
  speed: 1,
  stream: false,
  ...overrides,
})

describe('pixi sound backend', () => {
  beforeEach(() => {
    mocks.added.clear()
    mocks.library.useLegacy = false
    vi.clearAllMocks()
  })

  const backend = createPixiSoundBackend({ urlFor: (path) => `/game/${path}` })

  it('plays through @pixi/sound with the requested options', () => {
    backend.play(request({ loop: true, volume: 0.5, speed: 1.2 }))
    expect(mocks.library.add).toHaveBeenCalledWith(
      expect.stringMatching(/^rpgstudio-/),
      expect.objectContaining({
        url: '/game/audio/se/coin.ogg',
        loop: true,
        volume: 0.5,
        speed: 1.2,
        autoPlay: true,
      }),
    )
  })

  it('streams HTML audio only for streamed requests and restores the global afterwards', () => {
    backend.play(request({ stream: true }))
    backend.play(request({ stream: false }))
    const [streamed, decoded] = [...mocks.added.values()]
    expect(streamed?.legacy).toBe(true)
    expect(decoded?.legacy).toBe(false)
    expect(mocks.library.useLegacy).toBe(false)
  })

  it('restores the global flag even if creation throws', () => {
    mocks.library.add.mockImplementationOnce(() => {
      throw new Error('bad file')
    })
    expect(() => backend.play(request({ stream: true }))).toThrow('bad file')
    expect(mocks.library.useLegacy).toBe(false)
  })

  it('stops by removing the sound and updates volume in place', () => {
    const playing = backend.play(request())
    playing.setVolume(0.3)
    expect([...mocks.added.values()][0]?.volume).toBe(0.3)
    playing.stop()
    expect(mocks.added.size).toBe(0)
    playing.stop() // stopping twice is harmless
  })

  it('reports completion and cleans up', () => {
    const onEnd = vi.fn()
    backend.play(request({ onEnd }))
    const options = [...mocks.added.values()][0]?.options as { complete: () => void }
    options.complete()
    expect(onEnd).toHaveBeenCalledOnce()
    expect(mocks.added.size).toBe(0)
  })

  it('unlocks by resuming the audio context', async () => {
    await backend.unlock()
    expect(mocks.library.context.audioContext.resume).toHaveBeenCalledOnce()
  })
})
