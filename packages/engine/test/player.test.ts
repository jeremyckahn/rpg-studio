// @vitest-environment jsdom
import {
  GAME_BUNDLE_FILE,
  createEventBus,
  createStarterProject,
  projectToFiles,
} from '@rpgstudio/core'
import { describe, expect, it } from 'vitest'

import { type GameEventMap } from '../src'
import { createKeyboardInput, createMessageBox, loadGameBundle } from '../src/player'

const press = (target: EventTarget, type: 'keydown' | 'keyup', code: string, repeat = false) => {
  target.dispatchEvent(new KeyboardEvent(type, { code, repeat, cancelable: true }))
}

describe('keyboard input', () => {
  it('reports nothing when idle', () => {
    const input = createKeyboardInput(new EventTarget() as never)
    expect(input.poll()).toEqual({ direction: null, confirm: false })
  })

  it('maps arrows and WASD, holding while the key is down', () => {
    const target = new EventTarget()
    const input = createKeyboardInput(target as never)
    press(target, 'keydown', 'ArrowLeft')
    expect(input.poll().direction).toBe('left')
    expect(input.poll().direction).toBe('left')
    press(target, 'keyup', 'ArrowLeft')
    expect(input.poll().direction).toBeNull()
    press(target, 'keydown', 'KeyD')
    expect(input.poll().direction).toBe('right')
  })

  it('prefers the most recently pressed direction and falls back when it is released', () => {
    const target = new EventTarget()
    const input = createKeyboardInput(target as never)
    press(target, 'keydown', 'ArrowUp')
    press(target, 'keydown', 'ArrowRight')
    expect(input.poll().direction).toBe('right')
    press(target, 'keyup', 'ArrowRight')
    expect(input.poll().direction).toBe('up')
  })

  it('does not lose a tap that is released before the next frame', () => {
    const target = new EventTarget()
    const input = createKeyboardInput(target as never)
    press(target, 'keydown', 'ArrowRight')
    press(target, 'keyup', 'ArrowRight')
    expect(input.poll().direction).toBe('right')
    expect(input.poll().direction).toBeNull() // seen once, then gone
  })

  it('reports a confirm press exactly once, ignoring key repeat', () => {
    const target = new EventTarget()
    const input = createKeyboardInput(target as never)
    press(target, 'keydown', 'Enter')
    press(target, 'keydown', 'Enter', true)
    expect(input.poll().confirm).toBe(true)
    expect(input.poll().confirm).toBe(false)
    press(target, 'keydown', 'Space')
    expect(input.poll().confirm).toBe(true)
    press(target, 'keydown', 'KeyZ')
    expect(input.poll().confirm).toBe(true)
  })

  it('stops listening when disposed', () => {
    const target = new EventTarget()
    const input = createKeyboardInput(target as never)
    input.dispose()
    press(target, 'keydown', 'ArrowUp')
    expect(input.poll().direction).toBeNull()
  })
})

describe('message box', () => {
  it('shows and hides the current message from game events', () => {
    const bus = createEventBus<GameEventMap>()
    const parent = document.createElement('div')
    const box = createMessageBox(parent, bus)
    expect(box.element.style.display).toBe('none')
    bus.emit('message', { face: undefined, text: 'Hello' })
    expect(box.element.textContent).toBe('Hello')
    expect(box.element.style.display).toBe('block')
    bus.emit('message', { face: 'Elder', text: 'Welcome' })
    expect(box.element.textContent).toBe('Elder: Welcome')
    bus.emit('messageClosed')
    expect(box.element.style.display).toBe('none')
    box.dispose()
    expect(parent.children).toHaveLength(0)
    bus.emit('message', { face: undefined, text: 'ignored' })
  })

  it('renders text as text, never as HTML', () => {
    const bus = createEventBus<GameEventMap>()
    const parent = document.createElement('div')
    createMessageBox(parent, bus)
    bus.emit('message', { face: undefined, text: '<img src=x onerror=alert(1)>' })
    expect(parent.querySelector('img')).toBeNull()
  })
})

describe('game bundle loader', () => {
  const files = projectToFiles(createStarterProject('Quest'))
  const bundle = (extra: Record<string, unknown> = {}) =>
    JSON.stringify({
      format: 'rpgstudio-game',
      formatVersion: 1,
      name: 'Quest',
      files: [...Object.keys(files), 'img/tilesets/basic.png', 'audio/bgm/town.ogg'],
      plugins: [],
      ...extra,
    })

  const fetcher =
    (extra: Record<string, string>, log: string[] = []) =>
    (path: string): Promise<string> => {
      // eslint-disable-next-line functional/immutable-data -- records requested paths
      log.push(path)
      const text = { [GAME_BUNDLE_FILE]: bundle(), ...files, ...extra }[path]
      return text === undefined ? Promise.reject(new Error(`404 ${path}`)) : Promise.resolve(text)
    }

  it('loads and validates the project from game.json and its listed data files', async () => {
    const requested: string[] = []
    const loaded = await loadGameBundle(fetcher({}, requested))
    expect(loaded.project.meta.name).toBe('Quest')
    expect(loaded.project.maps).toHaveLength(1)
    // Binary assets are listed but never fetched as text.
    expect(requested).not.toContain('img/tilesets/basic.png')
    expect(requested).not.toContain('audio/bgm/town.ogg')
  })

  it('rejects an invalid bundle manifest', async () => {
    await expect(
      loadGameBundle(() => Promise.resolve(JSON.stringify({ format: 'nope' }))),
    ).rejects.toThrow(/game\.json is invalid/)
  })

  it('rejects corrupt game data with the file name', async () => {
    await expect(loadGameBundle(fetcher({ 'maps/map-001.json': '{"id":1}' }))).rejects.toThrow(
      /maps\/map-001\.json/,
    )
  })

  it('loads only the shared and engine heads of plugins, never the editor entry', async () => {
    const manifest = JSON.stringify({
      id: 'acme.counter',
      name: 'Counter',
      version: '1.0.0',
      entries: { shared: 'shared.js', editor: 'editor.js', engine: 'engine.js' },
    })
    const requested: string[] = []
    const loadable = fetcher(
      {
        [GAME_BUNDLE_FILE]: bundle({ plugins: ['acme.counter'] }),
        'plugins/acme.counter/manifest.json': manifest,
        'plugins/acme.counter/shared.js': 'export default { n: 1 }',
        'plugins/acme.counter/engine.js': 'export default {}',
      },
      requested,
    )
    const loaded = await loadGameBundle(loadable)
    expect(loaded.plugins).toHaveLength(1)
    expect(loaded.plugins[0]?.shared).toEqual({ n: 1 })
    expect(requested.some((path) => path.endsWith('editor.js'))).toBe(false)
  })
})
