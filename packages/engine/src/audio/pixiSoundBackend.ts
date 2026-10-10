import { sound } from '@pixi/sound'

import { type PlayRequest, type PlayingSound, type SoundBackend } from './manager.ts'

export interface PixiSoundBackendOptions {
  /** Maps a project path to a fetchable URL. */
  readonly urlFor: (path: string) => string
}

/**
 * `@pixi/sound` chooses between Web Audio (decoded, low latency, polyphonic) and
 * streamed HTML audio with one global flag, read when a sound is created. To get
 * streaming for long tracks and Web Audio for effects, the flag is switched only
 * for the duration of the `create` call, so each sound keeps the media type it
 * was built with.
 */
const withMedia = <T>(stream: boolean, create: () => T): T => {
  const previous = sound.useLegacy
  if (previous === stream) return create()
  sound.useLegacy = stream
  try {
    return create()
  } finally {
    sound.useLegacy = previous
  }
}

/**
 * Plays through `@pixi/sound`: Web Audio for effects and jingles, streamed HTML
 * audio for long music and ambience.
 */
export const createPixiSoundBackend = ({ urlFor }: PixiSoundBackendOptions): SoundBackend => {
  let counter = 0
  return {
    play: (request: PlayRequest): PlayingSound => {
      const alias = `rpgstudio-${counter++}`
      const instance = withMedia(request.stream, () =>
        sound.add(alias, {
          url: urlFor(request.path),
          loop: request.loop,
          volume: request.volume,
          speed: request.speed,
          autoPlay: true,
          preload: true,
          complete: () => {
            if (sound.exists(alias)) sound.remove(alias)
            request.onEnd?.()
          },
        }),
      )
      return {
        stop: () => {
          if (sound.exists(alias)) sound.remove(alias)
        },
        setVolume: (volume) => {
          instance.volume = volume
        },
      }
    },
    pause: () => {
      sound.pauseAll()
    },
    resume: () => {
      sound.resumeAll()
    },
    unlock: async () => {
      const context = sound.context as { audioContext?: AudioContext }
      await context.audioContext?.resume()
    },
  }
}
