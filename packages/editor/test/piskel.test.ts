// @vitest-environment jsdom
import {
  type RgbaImage,
  createDefaultTilesetPng,
  decodePng,
  encodePng,
  matricesToPiskel,
  parsePiskel,
  pngToDataUrl,
} from '@rpgstudio/core'
import { describe, expect, it, vi } from 'vitest'

import { createPiskelBridge, decodeImageWithCore } from '../src/piskel/bridge'
import {
  ADAPTER_SOURCE,
  AdapterMessageSchema,
  HOST_SOURCE,
  HostMessageSchema,
} from '../src/piskel/protocol'
import { connectTextureInvalidation } from '../src/piskel/textureInvalidation'
import { createAssetStore } from '../src/project/assetStore'
import { recorder } from './helpers'

const ORIGIN = 'http://localhost:5173'

const pixel = (r: number, g: number, b: number): RgbaImage => ({
  width: 2,
  height: 2,
  data: Uint8Array.from([r, g, b, 255, r, g, b, 255, r, g, b, 255, r, g, b, 255]),
})

const setup = (files: Record<string, string | Uint8Array> = {}) => {
  const assets = createAssetStore()
  Object.entries(files).forEach(([path, data]) => {
    assets.write(path, data)
  })
  const posted = recorder<unknown>()
  const frame = {
    postMessage: (message: unknown) => {
      posted.record(message)
    },
  } as unknown as Window
  const listeners = new EventTarget()
  const bridge = createPiskelBridge({
    target: () => frame,
    origin: ORIGIN,
    files: {
      readText: (path) => assets.readText(path),
      readBytes: (path) => assets.readBytes(path),
      write: (path, data) => {
        assets.write(path, data)
      },
    },
    listenOn: {
      addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
        listeners.addEventListener(type, listener)
      },
      removeEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
        listeners.removeEventListener(type, listener)
      },
    },
    decodeImage: decodeImageWithCore,
  })
  /** Delivers a message as if it came from the Piskel iframe. */
  const fromPiskel = (
    data: unknown,
    overrides: { origin?: string; source?: unknown } = {},
  ): void => {
    const event = Object.assign(new Event('message'), {
      data,
      origin: overrides.origin ?? ORIGIN,
      source: 'source' in overrides ? overrides.source : frame,
    })
    listeners.dispatchEvent(event)
  }
  const ready = (): void => {
    fromPiskel({ source: ADAPTER_SOURCE, type: 'ready' })
  }
  return { assets, bridge, posted, fromPiskel, ready }
}

const savedMessage = (png: Uint8Array, piskel = '{"modelVersion":2}', requestId?: string) => ({
  source: ADAPTER_SOURCE,
  type: 'saved',
  ...(requestId ? { requestId } : {}),
  piskel,
  png: pngToDataUrl(png),
  width: 2,
  height: 2,
  frames: 1,
})

describe('piskel protocol', () => {
  it('accepts well-formed messages in both directions', () => {
    expect(
      HostMessageSchema.safeParse({
        source: HOST_SOURCE,
        type: 'open',
        requestId: 'a',
        name: 'x',
        piskel: '{}',
      }).success,
    ).toBe(true)
    expect(AdapterMessageSchema.safeParse({ source: ADAPTER_SOURCE, type: 'ready' }).success).toBe(
      true,
    )
    expect(AdapterMessageSchema.safeParse(savedMessage(createDefaultTilesetPng())).success).toBe(
      true,
    )
  })

  it('rejects messages from other sources, unknown types, extra fields and non-PNG data', () => {
    expect(AdapterMessageSchema.safeParse({ source: 'someone-else', type: 'ready' }).success).toBe(
      false,
    )
    expect(
      AdapterMessageSchema.safeParse({ source: ADAPTER_SOURCE, type: 'eval', code: '1' }).success,
    ).toBe(false)
    expect(
      AdapterMessageSchema.safeParse({ source: ADAPTER_SOURCE, type: 'ready', extra: 1 }).success,
    ).toBe(false)
    const notPng = {
      ...savedMessage(createDefaultTilesetPng()),
      png: 'data:text/html;base64,PHNjcmlwdD4=',
    }
    expect(AdapterMessageSchema.safeParse(notPng).success).toBe(false)
    expect(
      AdapterMessageSchema.safeParse({ ...savedMessage(createDefaultTilesetPng()), width: 0 })
        .success,
    ).toBe(false)
  })
})

describe('piskel bridge', () => {
  it('queues the open request until Piskel says it is ready, then sends the .piskel document', async () => {
    const png = encodePng(pixel(10, 20, 30))
    const { bridge, posted, ready, fromPiskel } = setup({ 'img/characters/hero.png': png })
    const opening = bridge.open('img/characters/hero.png')
    await vi.waitFor(() => {
      expect(bridge.isReady()).toBe(false)
    })
    expect(posted.values).toEqual([])

    ready()
    await vi.waitFor(() => {
      expect(posted.values).toHaveLength(1)
    })
    const message = HostMessageSchema.parse(posted.values[0])
    expect(message).toMatchObject({ type: 'open', name: 'hero' })
    const document = parsePiskel(message.type === 'open' ? message.piskel : '')
    expect(document).toMatchObject({ name: 'hero', width: 2, height: 2 })
    expect([...(document.frames[0]?.data ?? [])]).toEqual([...pixel(10, 20, 30).data])

    fromPiskel({ source: ADAPTER_SOURCE, type: 'opened', requestId: message.requestId })
    await expect(opening).resolves.toBeUndefined()
  })

  it('prefers an existing .piskel so layers and frames survive', async () => {
    const piskel = matricesToPiskel(
      'walk',
      [
        { palette: ['#ff0000'], width: 1, height: 1, pixels: [0] },
        { palette: ['#00ff00'], width: 1, height: 1, pixels: [0] },
      ],
      6,
    )
    const { bridge, posted, ready, fromPiskel } = setup({
      'img/characters/walk.png': encodePng(pixel(0, 0, 0)),
      'img/characters/walk.piskel': piskel,
    })
    ready()
    const opening = bridge.open('img/characters/walk.png')
    await vi.waitFor(() => {
      expect(posted.values).toHaveLength(1)
    })
    const message = HostMessageSchema.parse(posted.values[0])
    expect(message.type === 'open' && message.piskel).toBe(piskel)
    fromPiskel({ source: ADAPTER_SOURCE, type: 'opened', requestId: message.requestId })
    await opening
  })

  it('can open from the .piskel path itself', async () => {
    const piskel = matricesToPiskel('x', [
      { palette: ['#ffffff'], width: 1, height: 1, pixels: [0] },
    ])
    const { bridge, posted, ready, fromPiskel } = setup({ 'img/a/x.piskel': piskel })
    ready()
    const opening = bridge.open('img/a/x.piskel')
    await vi.waitFor(() => {
      expect(posted.values).toHaveLength(1)
    })
    fromPiskel({ source: ADAPTER_SOURCE, type: 'opened' }) // an answer without an id settles the oldest request
    await opening
  })

  it('fails clearly when there is nothing to open', async () => {
    const { bridge } = setup()
    await expect(bridge.open('img/missing.png')).rejects.toThrow(
      /missing\.png is not in the project/,
    )
  })

  it('writes the saved PNG and .piskel into the project and reports what it saved', async () => {
    const original = encodePng(pixel(1, 2, 3))
    const { bridge, assets, posted, ready, fromPiskel } = setup({
      'img/characters/hero.png': original,
    })
    ready()
    const opening = bridge.open('img/characters/hero.png')
    await vi.waitFor(() => {
      expect(posted.values).toHaveLength(1)
    })
    fromPiskel({ source: ADAPTER_SOURCE, type: 'opened' })
    await opening

    const saved = recorder<unknown>()
    bridge.onSaved(saved.record)
    const saving = bridge.save()
    await vi.waitFor(() => {
      expect(posted.values).toHaveLength(2)
    })
    const request = HostMessageSchema.parse(posted.values[1])
    expect(request.type).toBe('requestSave')

    const edited = encodePng(pixel(200, 100, 50))
    fromPiskel(savedMessage(edited, '{"modelVersion":2,"edited":true}', request.requestId))
    await expect(saving).resolves.toEqual({
      base: 'img/characters/hero',
      width: 2,
      height: 2,
      frames: 1,
    })
    expect(decodePng(assets.readBytes('img/characters/hero.png') ?? new Uint8Array()).data[0]).toBe(
      200,
    )
    expect(assets.readText('img/characters/hero.piskel')).toBe('{"modelVersion":2,"edited":true}')
    expect(saved.values).toEqual([{ base: 'img/characters/hero', width: 2, height: 2, frames: 1 }])
  })

  it('handles saves started from Piskel’s own button, which carry no request id', async () => {
    const { bridge, assets, posted, ready, fromPiskel } = setup({
      'img/a/s.png': encodePng(pixel(1, 1, 1)),
    })
    ready()
    const opening = bridge.open('img/a/s.png')
    await vi.waitFor(() => {
      expect(posted.values).toHaveLength(1)
    })
    fromPiskel({ source: ADAPTER_SOURCE, type: 'opened' })
    await opening
    const saved = recorder<unknown>()
    bridge.onSaved(saved.record)
    fromPiskel(savedMessage(encodePng(pixel(9, 9, 9))))
    expect(saved.values).toHaveLength(1)
    expect(assets.has('img/a/s.piskel')).toBe(true)
  })

  it('ignores messages from the wrong origin, the wrong window, or in the wrong shape', () => {
    const { bridge, assets, posted, fromPiskel } = setup({
      'img/a/s.png': encodePng(pixel(1, 1, 1)),
    })
    const errors = recorder<string>()
    bridge.onError(errors.record)
    const readyListener = vi.fn()
    bridge.onReady(readyListener)

    fromPiskel({ source: ADAPTER_SOURCE, type: 'ready' }, { origin: 'https://evil.example' })
    fromPiskel({ source: ADAPTER_SOURCE, type: 'ready' }, { source: {} })
    fromPiskel({ source: ADAPTER_SOURCE, type: 'ready', extra: true })
    fromPiskel('ready')
    fromPiskel(null)
    expect(readyListener).not.toHaveBeenCalled()
    expect(bridge.isReady()).toBe(false)

    // Even a perfectly shaped save is refused from an untrusted sender, so it cannot write files.
    fromPiskel(savedMessage(encodePng(pixel(5, 5, 5))), { origin: 'https://evil.example' })
    fromPiskel(savedMessage(encodePng(pixel(5, 5, 5))), { source: {} })
    expect(assets.list()).toEqual(['img/a/s.png'])
    expect(posted.values).toEqual([])
    expect(errors.values).toEqual([])
  })

  it('reports an error from Piskel and rejects the pending request', async () => {
    const { bridge, ready, fromPiskel, posted } = setup({
      'img/a/s.png': encodePng(pixel(1, 1, 1)),
    })
    ready()
    const errors = recorder<string>()
    bridge.onError(errors.record)
    const opening = bridge.open('img/a/s.png')
    await vi.waitFor(() => {
      expect(posted.values).toHaveLength(1)
    })
    fromPiskel({ source: ADAPTER_SOURCE, type: 'error', message: 'Cannot open the document' })
    await expect(opening).rejects.toThrow('Cannot open the document')
    expect(errors.values).toEqual(['Cannot open the document'])
  })

  it('refuses to store a save when nothing is open', () => {
    const { bridge, assets, fromPiskel } = setup()
    const errors = recorder<string>()
    bridge.onError(errors.record)
    fromPiskel(savedMessage(encodePng(pixel(1, 1, 1))))
    expect(errors.values).toEqual(['Nothing is open in the sprite editor'])
    expect(assets.list()).toEqual([])
  })

  it('stops listening and rejects pending work when disposed', async () => {
    const { bridge, ready, fromPiskel, posted } = setup({
      'img/a/s.png': encodePng(pixel(1, 1, 1)),
    })
    ready()
    const opening = bridge.open('img/a/s.png')
    await vi.waitFor(() => {
      expect(posted.values).toHaveLength(1)
    })
    bridge.dispose()
    await expect(opening).rejects.toThrow(/closed/)
    const listener = vi.fn()
    bridge.onError(listener)
    fromPiskel({ source: ADAPTER_SOURCE, type: 'error', message: 'late' })
    expect(listener).not.toHaveBeenCalled()
  })
})

describe('live texture hot-reloading', () => {
  it('resets the texture cache whenever any asset changes', () => {
    const assets = createAssetStore()
    const invalidate = vi.fn()
    const stop = connectTextureInvalidation(assets, invalidate)
    assets.write('img/characters/hero.png', 'a') // a sprite saved from Piskel
    expect(invalidate).toHaveBeenCalledTimes(1)
    assets.write('img/characters/hero.png', 'b')
    assets.remove('img/characters/hero.png')
    assets.replaceAll({ 'img/x.png': Uint8Array.of(1) })
    expect(invalidate).toHaveBeenCalledTimes(4)
    stop()
    assets.write('img/y.png', 'c')
    expect(invalidate).toHaveBeenCalledTimes(4)
  })
})
