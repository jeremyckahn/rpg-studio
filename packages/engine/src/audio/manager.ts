import { type AudioCue, type AudioPort, type AudioTier } from '../game/types.ts'

/** A sound that is playing and can be stopped. */
export interface PlayingSound {
  stop: () => void
  setVolume: (volume: number) => void
}

export interface PlayRequest {
  /** Project-relative path of the audio file, e.g. `audio/bgm/town.ogg`. */
  readonly path: string
  readonly loop: boolean
  /** 0..1 */
  readonly volume: number
  /** Playback speed; 1 is normal. */
  readonly speed: number
  /** Whether to stream rather than decode the whole file (long music and ambience). */
  readonly stream: boolean
  readonly onEnd?: () => void
}

/** The sound engine behind the manager (`@pixi/sound` in the browser). */
export interface SoundBackend {
  play: (request: PlayRequest) => PlayingSound
  /** Resumes a suspended audio context. Must be called from a user gesture. */
  unlock: () => Promise<void>
}

export interface AudioManagerOptions {
  readonly backend: SoundBackend
  /** Maps a cue to a project path, e.g. by trying known file extensions. */
  readonly resolvePath: (tier: AudioTier, name: string) => string | undefined
}

export interface AudioManager extends AudioPort {
  /** Master volume (0..1) applied on top of each cue's own volume. */
  setMasterVolume: (volume: number) => void
  /** Per-tier volume (0..1), e.g. to expose music and effects sliders. */
  setTierVolume: (tier: AudioTier, volume: number) => void
  unlock: () => Promise<void>
  stopAll: () => void
}

const STREAMED: Readonly<Record<AudioTier, boolean>> = {
  bgm: true,
  bgs: true,
  me: false,
  se: false,
}
const LOOPED: Readonly<Record<AudioTier, boolean>> = { bgm: true, bgs: true, me: false, se: false }

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value))

/**
 * The four RPG audio tiers.
 *
 * - **BGM** and **BGS** are single looping tracks; starting one replaces the last
 *   (a cue for the track already playing is ignored).
 * - **ME** is a short jingle that ducks the BGM while it plays.
 * - **SE** are fire-and-forget and may overlap freely.
 */
export const createAudioManager = ({ backend, resolvePath }: AudioManagerOptions): AudioManager => {
  let master = 1
  let tierVolume: Readonly<Record<AudioTier, number>> = { bgm: 1, bgs: 1, me: 1, se: 1 }
  let current: Readonly<
    Partial<Record<'bgm' | 'bgs' | 'me', { sound: PlayingSound; name: string; cue: number }>>
  > = {}
  let effects: readonly PlayingSound[] = []

  const gain = (tier: AudioTier, cueVolume: number): number =>
    clamp01((cueVolume / 100) * tierVolume[tier] * master)

  const setCurrent = (tier: 'bgm' | 'bgs' | 'me', entry: (typeof current)[typeof tier]): void => {
    current = { ...current, [tier]: entry }
  }

  const stop = (tier: AudioTier): void => {
    if (tier === 'se') {
      effects.forEach((sound) => {
        sound.stop()
      })
      effects = []
      return
    }
    current[tier]?.sound.stop()
    setCurrent(tier, undefined)
    if (tier === 'me') duckBgm(false)
  }

  /** Mutes (or restores) the BGM around a jingle. */
  const duckBgm = (ducked: boolean): void => {
    const bgm = current.bgm
    bgm?.sound.setVolume(ducked ? 0 : gain('bgm', bgm.cue))
  }

  const play: AudioPort['play'] = (tier, cue: AudioCue) => {
    const path = resolvePath(tier, cue.name)
    if (path === undefined) return // missing audio must never crash a game

    if ((tier === 'bgm' || tier === 'bgs') && current[tier]?.name === cue.name) return

    const request = (onEnd?: () => void): PlayRequest => ({
      path,
      loop: LOOPED[tier],
      volume: gain(tier, cue.volume),
      speed: cue.pitch / 100,
      stream: STREAMED[tier],
      ...(onEnd ? { onEnd } : {}),
    })

    if (tier === 'se') {
      const sound = backend.play(
        request(() => {
          effects = effects.filter((candidate) => candidate !== sound)
        }),
      )
      effects = [...effects, sound]
      return
    }

    if (tier === 'me') {
      stop('me')
      duckBgm(true)
      const sound = backend.play(
        request(() => {
          setCurrent('me', undefined)
          duckBgm(false)
        }),
      )
      setCurrent('me', { sound, name: cue.name, cue: cue.volume })
      return
    }

    stop(tier)
    const sound = backend.play(request())
    setCurrent(tier, { sound, name: cue.name, cue: cue.volume })
    // A BGM started mid-jingle stays quiet until the jingle ends.
    if (tier === 'bgm' && current.me) sound.setVolume(0)
  }

  const refreshVolumes = (): void => {
    const live = current
    ;(['bgm', 'bgs', 'me'] as const).forEach((tier) => {
      const entry = live[tier]
      if (!entry) return
      entry.sound.setVolume(tier === 'bgm' && live.me ? 0 : gain(tier, entry.cue))
    })
  }

  return {
    play,
    stop,
    setMasterVolume: (volume) => {
      master = clamp01(volume)
      refreshVolumes()
    },
    setTierVolume: (tier, volume) => {
      tierVolume = { ...tierVolume, [tier]: clamp01(volume) }
      refreshVolumes()
    },
    unlock: () => backend.unlock(),
    stopAll: () => {
      ;(['bgm', 'bgs', 'me', 'se'] as const).forEach(stop)
    },
  }
}

/** Candidate file extensions, in order of preference. */
export const AUDIO_EXTENSIONS = ['ogg', 'm4a', 'mp3', 'wav'] as const

/**
 * Builds a `resolvePath` from the list of files that exist in the project, so a
 * cue named `town` finds `audio/bgm/town.ogg` (or .m4a, .mp3, .wav).
 */
export const createAudioPathResolver = (
  files: Iterable<string>,
): AudioManagerOptions['resolvePath'] => {
  const known = new Set(files)
  return (tier, name) =>
    AUDIO_EXTENSIONS.map((extension) => `audio/${tier}/${name}.${extension}`).find((path) =>
      known.has(path),
    )
}
