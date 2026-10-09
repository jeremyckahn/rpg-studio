import { createStarterProject } from '@rpgstudio/core'
import { describe, expect, it, vi } from 'vitest'

import { createAssetUrls } from '../src/preview/previewAssets'
import {
  type RunEvent,
  type RunState,
  initialRunState,
  isRunning,
  pauseReasons,
  reduceRun,
} from '../src/preview/previewControls'
import { chooseCheckpoint, describeRestart } from '../src/preview/previewReload'
import { applyStart, describeStart, isValidStart } from '../src/preview/previewStart'

const run = (...events: readonly RunEvent[]): RunState => events.reduce(reduceRun, initialRunState)

describe('run state', () => {
  it('waits for focus before running, so a fresh preview never plays unheard', () => {
    expect(isRunning(initialRunState)).toBe(false)
    expect(pauseReasons(initialRunState)).toEqual(['focus'])
    expect(isRunning(run('focusEntered'))).toBe(true)
  })

  it('pauses for each of its three reasons and runs only when none is left', () => {
    const playing = run('focusEntered')
    expect(pauseReasons(reduceRun(playing, 'userPaused'))).toEqual(['user'])
    expect(pauseReasons(reduceRun(playing, 'tabHidden'))).toEqual(['hidden'])
    expect(pauseReasons(reduceRun(playing, 'focusLeft'))).toEqual(['focus'])
    expect(pauseReasons(run('focusEntered', 'userPaused', 'tabHidden', 'focusLeft'))).toEqual([
      'user',
      'hidden',
      'focus',
    ])
  })

  it('does not resume a game the user paused just because the tab came back or focus returned', () => {
    const state = run(
      'focusEntered',
      'userPaused',
      'tabHidden',
      'tabShown',
      'focusLeft',
      'focusEntered',
    )
    expect(isRunning(state)).toBe(false)
    expect(pauseReasons(state)).toEqual(['user'])
  })

  it('resumes from a user pause and from lost focus with one Resume', () => {
    expect(isRunning(run('focusEntered', 'userPaused', 'focusLeft', 'userResumed'))).toBe(true)
  })

  it('still waits for a hidden tab to come back when the user presses Resume', () => {
    const state = run('focusEntered', 'tabHidden', 'userResumed')
    expect(isRunning(state)).toBe(false)
    expect(isRunning(reduceRun(state, 'tabShown'))).toBe(true)
  })

  it('is idempotent: repeating an event changes nothing', () => {
    const once = run('focusEntered', 'userPaused')
    expect(reduceRun(once, 'userPaused')).toEqual(once)
  })
})

describe('chooseCheckpoint', () => {
  const game = (canSave: boolean) => ({
    canSave: () => canSave,
    serialize: vi.fn(() => 'live-save'),
  })

  it('starts again when the user asked not to keep their place', () => {
    expect(chooseCheckpoint(game(true), 'old', false)).toBeUndefined()
  })

  it('saves the game as it is when it can be saved', () => {
    expect(chooseCheckpoint(game(true), 'old', true)).toBe('live-save')
  })

  it('falls back to the last checkpoint while a cutscene runs, which cannot be saved', () => {
    const cutscene = game(false)
    expect(chooseCheckpoint(cutscene, 'old', true)).toBe('old')
    expect(cutscene.serialize).not.toHaveBeenCalled()
  })

  it('has nothing to continue from when no checkpoint exists yet', () => {
    expect(chooseCheckpoint(game(false), undefined, true)).toBeUndefined()
  })

  it('words a refusal so it reads as a sentence', () => {
    expect(describeRestart('Map 3 does not exist.')).toBe(
      'Restarted from the beginning: Map 3 does not exist.',
    )
  })
})

describe('play from here', () => {
  const project = createStarterProject('Quest')

  it('replaces only the start position, on a copy', () => {
    const played = applyStart(project, { mapId: 1, x: 3, y: 4 })
    expect(played.meta).toMatchObject({ startMapId: 1, startX: 3, startY: 4 })
    expect(played.meta.name).toBe(project.meta.name)
    expect(project.meta).toMatchObject({ startX: 10, startY: 7 })
  })

  it('returns the very same project when nothing is set', () => {
    expect(applyStart(project, null)).toBe(project)
  })

  it('ignores a start the project can no longer honour', () => {
    expect(isValidStart(project, { mapId: 9, x: 0, y: 0 })).toBe(false)
    expect(isValidStart(project, { mapId: 1, x: 99, y: 0 })).toBe(false)
    expect(isValidStart(project, { mapId: 1, x: -1, y: 0 })).toBe(false)
    expect(applyStart(project, { mapId: 1, x: 99, y: 0 })).toBe(project)
  })

  it('names the start for the toolbar, or says nothing when it is not valid', () => {
    expect(describeStart(project, { mapId: 1, x: 3, y: 4 })).toBe(`${project.maps[0]?.name} (3, 4)`)
    expect(describeStart(project, null)).toBeNull()
    expect(describeStart(project, { mapId: 9, x: 0, y: 0 })).toBeNull()
  })
})

describe('asset URLs', () => {
  const setup = () => {
    let counter = 0
    const api = {
      createObjectURL: vi.fn(() => `blob:${(counter += 1)}`),
      revokeObjectURL: vi.fn(),
    }
    const files: Record<string, Uint8Array> = { 'audio/bgm/town.ogg': new Uint8Array([1]) }
    return { api, files, urls: createAssetUrls((path) => files[path], api) }
  }

  it('hands out one URL per unchanged file', () => {
    const { urls, api } = setup()
    expect(urls.urlFor('audio/bgm/town.ogg')).toBe(urls.urlFor('audio/bgm/town.ogg'))
    expect(api.createObjectURL).toHaveBeenCalledOnce()
  })

  it('replaces and revokes the URL when the file is written again', () => {
    const { urls, api, files } = setup()
    const first = urls.urlFor('audio/bgm/town.ogg')
    // eslint-disable-next-line functional/immutable-data -- simulates an edited file
    files['audio/bgm/town.ogg'] = new Uint8Array([2])
    const second = urls.urlFor('audio/bgm/town.ogg')
    expect(second).not.toBe(first)
    expect(api.revokeObjectURL).toHaveBeenCalledWith(first)
  })

  it('answers a path with no file with the path itself, creating nothing', () => {
    const { urls, api } = setup()
    expect(urls.urlFor('audio/bgm/none.ogg')).toBe('audio/bgm/none.ogg')
    expect(api.createObjectURL).not.toHaveBeenCalled()
  })

  it('revokes everything when disposed', () => {
    const { urls, api } = setup()
    const url = urls.urlFor('audio/bgm/town.ogg')
    urls.dispose()
    expect(api.revokeObjectURL).toHaveBeenCalledWith(url)
    urls.dispose()
    expect(api.revokeObjectURL).toHaveBeenCalledOnce()
  })
})
