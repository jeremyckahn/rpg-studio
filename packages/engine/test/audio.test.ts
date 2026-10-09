// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'

import {
  type AudioManagerOptions,
  type PlayRequest,
  type PlayingSound,
  type SoundBackend,
  UNLOCK_EVENTS,
  createAudioManager,
  createAudioPathResolver,
  installAudioUnlock,
} from '../src/audio'

interface FakeSound extends PlayingSound {
  readonly request: PlayRequest
  readonly stopped: () => boolean
  readonly volume: () => number
  readonly end: () => void
}

const createFakeBackend = () => {
  const sounds: FakeSound[] = []
  const backend: SoundBackend = {
    play: (request) => {
      let stopped = false
      let volume = request.volume
      const fake: FakeSound = {
        request,
        stopped: () => stopped,
        volume: () => volume,
        end: () => {
          stopped = true
          request.onEnd?.()
        },
        stop: () => {
          stopped = true
        },
        setVolume: (next) => {
          volume = next
        },
      }
      // eslint-disable-next-line functional/immutable-data -- test double records what it was asked to play
      sounds.push(fake)
      return fake
    },
    unlock: vi.fn(() => Promise.resolve()),
    pause: vi.fn(),
    resume: vi.fn(),
  }
  return { backend, sounds }
}

const resolvePath: AudioManagerOptions['resolvePath'] = (tier, name) =>
  name === 'missing' ? undefined : `audio/${tier}/${name}.ogg`

const setup = () => {
  const fake = createFakeBackend()
  return { ...fake, manager: createAudioManager({ backend: fake.backend, resolvePath }) }
}

const cue = (name: string, volume = 100, pitch = 100) => ({ name, volume, pitch })

describe('audio manager tiers', () => {
  it('streams looping BGM and BGS but decodes ME and SE', () => {
    const { manager, sounds } = setup()
    manager.play('bgm', cue('town'))
    manager.play('bgs', cue('rain'))
    manager.play('me', cue('fanfare'))
    manager.play('se', cue('coin'))
    expect(sounds.map((s) => [s.request.path, s.request.loop, s.request.stream])).toEqual([
      ['audio/bgm/town.ogg', true, true],
      ['audio/bgs/rain.ogg', true, true],
      ['audio/me/fanfare.ogg', false, false],
      ['audio/se/coin.ogg', false, false],
    ])
  })

  it('scales cue volume to 0..1 and pitch to playback speed', () => {
    const { manager, sounds } = setup()
    manager.play('se', cue('coin', 50, 150))
    expect(sounds[0]?.request).toMatchObject({ volume: 0.5, speed: 1.5 })
  })

  it('replaces the BGM when a different track starts, and ignores a repeat of the same one', () => {
    const { manager, sounds } = setup()
    manager.play('bgm', cue('town'))
    manager.play('bgm', cue('town'))
    expect(sounds).toHaveLength(1)
    manager.play('bgm', cue('cave'))
    expect(sounds).toHaveLength(2)
    expect(sounds[0]?.stopped()).toBe(true)
    expect(sounds[1]?.stopped()).toBe(false)
  })

  it('keeps BGM and BGS independent', () => {
    const { manager, sounds } = setup()
    manager.play('bgm', cue('town'))
    manager.play('bgs', cue('rain'))
    manager.play('bgs', cue('wind'))
    expect(sounds[0]?.stopped()).toBe(false)
    expect(sounds[1]?.stopped()).toBe(true)
  })

  it('lets sound effects overlap and stops them all on request', () => {
    const { manager, sounds } = setup()
    manager.play('se', cue('coin'))
    manager.play('se', cue('coin'))
    manager.play('se', cue('hit'))
    expect(sounds.filter((s) => !s.stopped())).toHaveLength(3)
    manager.stop('se')
    expect(sounds.every((s) => s.stopped())).toBe(true)
  })

  it('forgets finished sound effects so they are not stopped twice', () => {
    const { manager, sounds } = setup()
    manager.play('se', cue('coin'))
    sounds[0]?.end()
    manager.stop('se')
    expect(sounds).toHaveLength(1)
  })

  it('ducks the BGM while a jingle plays, then restores it', () => {
    const { manager, sounds } = setup()
    manager.play('bgm', cue('town', 80))
    expect(sounds[0]?.volume()).toBeCloseTo(0.8)
    manager.play('me', cue('fanfare'))
    expect(sounds[0]?.volume()).toBe(0)
    sounds[1]?.end()
    expect(sounds[0]?.volume()).toBeCloseTo(0.8)
  })

  it('keeps a BGM started during a jingle quiet until the jingle ends', () => {
    const { manager, sounds } = setup()
    manager.play('me', cue('fanfare'))
    manager.play('bgm', cue('town'))
    expect(sounds[1]?.volume()).toBe(0)
    sounds[0]?.end()
    expect(sounds[1]?.volume()).toBeCloseTo(1)
  })

  it('applies master and per-tier volume to playing and future sounds', () => {
    const { manager, sounds } = setup()
    manager.play('bgm', cue('town', 100))
    manager.setMasterVolume(0.5)
    expect(sounds[0]?.volume()).toBeCloseTo(0.5)
    manager.setTierVolume('bgm', 0.5)
    expect(sounds[0]?.volume()).toBeCloseTo(0.25)
    manager.play('se', cue('coin', 100))
    expect(sounds[1]?.request.volume).toBeCloseTo(0.5) // master only: the SE tier is untouched
    manager.setMasterVolume(7) // clamped
    expect(sounds[0]?.volume()).toBeCloseTo(0.5)
  })

  it('ignores cues whose file does not exist instead of crashing the game', () => {
    const { manager, sounds } = setup()
    expect(() => {
      manager.play('se', cue('missing'))
    }).not.toThrow()
    expect(sounds).toHaveLength(0)
  })

  it('stopAll silences every tier', () => {
    const { manager, sounds } = setup()
    manager.play('bgm', cue('town'))
    manager.play('bgs', cue('rain'))
    manager.play('me', cue('fanfare'))
    manager.play('se', cue('coin'))
    manager.stopAll()
    expect(sounds.every((s) => s.stopped())).toBe(true)
  })

  it('freezes and continues all sound through the backend without stopping anything', () => {
    const { manager, backend, sounds } = setup()
    manager.play('bgm', cue('town'))
    manager.pauseAll()
    expect(backend.pause).toHaveBeenCalledOnce()
    expect(sounds[0]?.stopped()).toBe(false)
    manager.resumeAll()
    expect(backend.resume).toHaveBeenCalledOnce()
    // The track is still the current one, so a repeated cue is still ignored.
    manager.play('bgm', cue('town'))
    expect(sounds).toHaveLength(1)
  })

  it('delegates unlocking to the backend', async () => {
    const { manager, backend } = setup()
    await manager.unlock()
    expect(backend.unlock).toHaveBeenCalledOnce()
  })
})

describe('audio path resolver', () => {
  it('finds the first available extension in preference order', () => {
    const resolve = createAudioPathResolver([
      'audio/bgm/town.mp3',
      'audio/bgm/town.ogg',
      'audio/se/coin.wav',
      'img/x.png',
    ])
    expect(resolve('bgm', 'town')).toBe('audio/bgm/town.ogg')
    expect(resolve('se', 'coin')).toBe('audio/se/coin.wav')
    expect(resolve('bgm', 'cave')).toBeUndefined()
    expect(resolve('me', 'coin')).toBeUndefined()
  })
})

describe('audio unlock handler', () => {
  it('unlocks on the first user gesture and then stops listening', async () => {
    const target = new EventTarget()
    const unlock = vi.fn(() => Promise.resolve())
    installAudioUnlock(target, unlock)
    target.dispatchEvent(new Event('pointerdown'))
    target.dispatchEvent(new Event('keydown'))
    await Promise.resolve()
    expect(unlock).toHaveBeenCalledOnce()
  })

  it('listens for every documented gesture type', () => {
    expect([...UNLOCK_EVENTS].toSorted()).toEqual(['click', 'keydown', 'pointerdown', 'touchend'])
    UNLOCK_EVENTS.forEach((type) => {
      const target = new EventTarget()
      const unlock = vi.fn()
      installAudioUnlock(target, unlock)
      target.dispatchEvent(new Event(type))
      expect(unlock, type).toHaveBeenCalledOnce()
    })
  })

  it('does nothing until a gesture happens', () => {
    const unlock = vi.fn()
    installAudioUnlock(new EventTarget(), unlock)
    expect(unlock).not.toHaveBeenCalled()
  })

  it('retries on the next gesture if unlocking fails', async () => {
    const target = new EventTarget()
    const unlock = vi
      .fn()
      .mockRejectedValueOnce(new Error('not trusted'))
      .mockResolvedValue(undefined)
    installAudioUnlock(target, unlock)
    target.dispatchEvent(new Event('click'))
    await new Promise((resolve) => setTimeout(resolve, 0))
    target.dispatchEvent(new Event('click'))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(unlock).toHaveBeenCalledTimes(2)
    target.dispatchEvent(new Event('click'))
    expect(unlock).toHaveBeenCalledTimes(2)
  })

  it('does not re-arm itself if cancelled while an unlock attempt is failing', async () => {
    const target = new EventTarget()
    const unlock = vi.fn().mockRejectedValue(new Error('not trusted'))
    const cancel = installAudioUnlock(target, unlock)
    target.dispatchEvent(new Event('click'))
    cancel()
    await new Promise((resolve) => setTimeout(resolve, 0))
    target.dispatchEvent(new Event('click'))
    expect(unlock).toHaveBeenCalledOnce()
  })

  it('can be cancelled', () => {
    const target = new EventTarget()
    const unlock = vi.fn()
    const cancel = installAudioUnlock(target, unlock)
    cancel()
    target.dispatchEvent(new Event('pointerdown'))
    expect(unlock).not.toHaveBeenCalled()
  })
})
