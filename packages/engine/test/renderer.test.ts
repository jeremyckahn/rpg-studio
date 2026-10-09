import { type Tilemap, createEmptyMap } from '@rpgstudio/core'
import { Assets, Texture, TextureSource, TextureStyle } from 'pixi.js'
import { describe, expect, it, vi } from 'vitest'

import {
  PIXEL_ART_APPLICATION_OPTIONS,
  PIXEL_ART_SCALE_MODE,
  type TileSink,
  applyPixelArt,
  createAssetTextureProvider,
  computeCamera,
  configurePixelArtDefaults,
  createTilemapLayers,
  drawTiles,
  integerScale,
  letterboxOffset,
  planTileDraws,
  tilesetColumnCount,
  visualTile,
  walkFrameIndex,
} from '../src/renderer'
import { createFixedStepClock } from '../src'

describe('pixel-perfect configuration', () => {
  it('uses nearest-neighbour sampling, no antialiasing and rounded pixels', () => {
    expect(PIXEL_ART_SCALE_MODE).toBe('nearest')
    expect(PIXEL_ART_APPLICATION_OPTIONS).toMatchObject({ antialias: false, roundPixels: true })
  })

  it('makes every new texture nearest-neighbour by default', () => {
    configurePixelArtDefaults()
    expect(TextureStyle.defaultOptions.scaleMode).toBe('nearest')
    expect(new TextureSource({ width: 4, height: 4 }).scaleMode).toBe('nearest')
  })

  it('can force nearest-neighbour on an existing texture source', () => {
    const source = new TextureSource({ width: 4, height: 4, scaleMode: 'linear' })
    expect(source.scaleMode).toBe('linear')
    applyPixelArt(source)
    expect(source.scaleMode).toBe('nearest')
  })
})

describe('integer scaling', () => {
  const design = { width: 320, height: 240 }

  it('picks the largest whole zoom that fits', () => {
    expect(integerScale({ width: 320, height: 240 }, design)).toBe(1)
    expect(integerScale({ width: 959, height: 720 }, design)).toBe(2)
    expect(integerScale({ width: 960, height: 720 }, design)).toBe(3)
    expect(integerScale({ width: 1920, height: 1080 }, design)).toBe(4) // height-limited
  })

  it('never goes below 1, even in a tiny window', () => {
    expect(integerScale({ width: 100, height: 50 }, design)).toBe(1)
  })

  it('always returns a whole number', () => {
    ;[333, 641, 1000, 1366, 2559].forEach((width) => {
      expect(Number.isInteger(integerScale({ width, height: 900 }, design))).toBe(true)
    })
  })

  it('centres the zoomed view with whole-pixel offsets', () => {
    expect(letterboxOffset({ width: 1920, height: 1080 }, design, 4)).toEqual({ x: 320, y: 60 })
    expect(letterboxOffset({ width: 321, height: 241 }, design, 1)).toEqual({ x: 0, y: 0 })
  })
})

describe('camera', () => {
  const view = { width: 320, height: 240 }
  const world = { width: 1000, height: 800 }

  it('centres on the focus point', () => {
    expect(computeCamera({ x: 500, y: 400 }, world, view)).toEqual({ x: 340, y: 280 })
  })

  it('stops at the map edges', () => {
    expect(computeCamera({ x: 10, y: 10 }, world, view)).toEqual({ x: 0, y: 0 })
    expect(computeCamera({ x: 990, y: 790 }, world, view)).toEqual({ x: 680, y: 560 })
  })

  it('centres a map smaller than the view', () => {
    expect(computeCamera({ x: 20, y: 20 }, { width: 160, height: 120 }, view)).toEqual({
      x: -80,
      y: -60,
    })
  })

  it('rounds to whole pixels so sprites never straddle texels', () => {
    const camera = computeCamera({ x: 500.5, y: 400.25 }, world, view)
    expect(Number.isInteger(camera.x) && Number.isInteger(camera.y)).toBe(true)
  })
})

describe('character animation', () => {
  it('interpolates between a tile and its step target', () => {
    const entity = {
      kind: 'player' as const,
      position: { x: 2, y: 3 },
      movement: {
        direction: 'right' as const,
        speed: 4,
        intent: null,
        target: { x: 3, y: 3 },
        progress: 0.25,
      },
    }
    expect(visualTile(entity)).toEqual({ x: 2.25, y: 3 })
    expect(visualTile({ ...entity, movement: { ...entity.movement, target: null } })).toEqual({
      x: 2,
      y: 3,
    })
    expect(visualTile({ kind: 'event' })).toBeUndefined()
  })

  it('reads the standard 3x4 layout: rows down/left/right/up, stand in the middle', () => {
    expect(walkFrameIndex('down', false, 0, 3, 4)).toBe(1)
    expect(walkFrameIndex('left', false, 0, 3, 4)).toBe(4)
    expect(walkFrameIndex('right', false, 0, 3, 4)).toBe(7)
    expect(walkFrameIndex('up', false, 0, 3, 4)).toBe(10)
    expect(walkFrameIndex('up', true, 0.2, 3, 4)).toBe(9)
    expect(walkFrameIndex('up', true, 0.8, 3, 4)).toBe(11)
  })

  it('falls back to frame 0 for sheets too small to animate', () => {
    expect(walkFrameIndex('left', true, 0.8, 1, 1)).toBe(0)
    expect(walkFrameIndex('left', true, 0.8, 2, 4)).toBe(0)
  })
})

const mapWith = (layers: Tilemap['layers'], width = 3, height = 2): Tilemap => ({
  ...createEmptyMap({ id: 1, name: 'm', width, height }),
  layers,
})

describe('tile draw planning', () => {
  it('maps tile ids to tileset cells and cells to pixels', () => {
    const map = mapWith([{ name: 'a', visible: true, above: false, data: [1, 0, 9, 0, 17, 0] }])
    expect(planTileDraws(map, 8, false)).toEqual([
      { x: 0, y: 0, u: 0, v: 0 },
      { x: 32, y: 0, u: 0, v: 16 }, // id 9 -> cell 8 -> second row, first column
      { x: 16, y: 16, u: 0, v: 32 }, // id 17 -> cell 16 -> third row
    ])
  })

  it('skips empty cells and hidden layers', () => {
    const map = mapWith([
      { name: 'a', visible: false, above: false, data: [1, 1, 1, 1, 1, 1] },
      { name: 'b', visible: true, above: false, data: [0, 0, 0, 0, 0, 2] },
    ])
    expect(planTileDraws(map, 8, false)).toEqual([{ x: 32, y: 16, u: 16, v: 0 }])
  })

  it('separates layers drawn below and above characters, bottom layer first', () => {
    const map = mapWith([
      { name: 'ground', visible: true, above: false, data: [1, 1, 1, 1, 1, 1] },
      { name: 'objects', visible: true, above: false, data: [2, 0, 0, 0, 0, 0] },
      { name: 'roof', visible: true, above: true, data: [0, 3, 0, 0, 0, 0] },
    ])
    const below = planTileDraws(map, 8, false)
    expect(below).toHaveLength(7)
    expect(below[6]).toEqual({ x: 0, y: 0, u: 16, v: 0 }) // object layer drawn after the ground
    expect(planTileDraws(map, 8, true)).toEqual([{ x: 16, y: 0, u: 32, v: 0 }])
  })

  it('counts tileset columns from the texture width', () => {
    expect(tilesetColumnCount(128, 16)).toBe(8)
    expect(tilesetColumnCount(130, 16)).toBe(8)
    expect(tilesetColumnCount(8, 16)).toBe(1)
  })
})

describe('tilemap batching', () => {
  it('clears the sink and submits every planned tile with its source rectangle', () => {
    const tile = vi.fn()
    const clear = vi.fn()
    const sink: TileSink = { tile, clear }
    const texture = Texture.WHITE
    drawTiles(
      sink,
      texture,
      [
        { x: 0, y: 0, u: 16, v: 32 },
        { x: 16, y: 0, u: 0, v: 0 },
      ],
      16,
    )
    expect(clear).toHaveBeenCalledOnce()
    expect(tile).toHaveBeenNthCalledWith(1, texture, 0, 0, {
      u: 16,
      v: 32,
      tileWidth: 16,
      tileHeight: 16,
    })
    expect(tile).toHaveBeenCalledTimes(2)
  })

  it('applies an alpha to every tile, since the tilemap shader ignores the layer alpha', () => {
    const tile = vi.fn()
    const sink: TileSink = { tile, clear: vi.fn() }
    drawTiles(
      sink,
      Texture.WHITE,
      [
        { x: 0, y: 0, u: 0, v: 0 },
        { x: 16, y: 0, u: 16, v: 0 },
      ],
      16,
      0.4,
    )
    expect(tile.mock.calls.map(([, , , options]) => (options as { alpha?: number }).alpha)).toEqual(
      [0.4, 0.4],
    )
  })

  it('batches a whole multi-layer map into one tilemap per draw group', () => {
    const map = mapWith([
      { name: 'ground', visible: true, above: false, data: [1, 1, 1, 1, 1, 1] },
      { name: 'objects', visible: true, above: false, data: [2, 0, 0, 0, 0, 3] },
      { name: 'roof', visible: true, above: true, data: [0, 4, 0, 0, 0, 0] },
    ])
    const layers = createTilemapLayers(map, Texture.WHITE)
    // One shared tileset texture means one underlying tilemap (one draw call) per group.
    expect(layers.below.children).toHaveLength(1)
    expect(layers.above.children).toHaveLength(1)
  })

  it('draws nothing for a group with no tiles', () => {
    const map = mapWith([{ name: 'ground', visible: true, above: false, data: [1, 1, 1, 1, 1, 1] }])
    expect(createTilemapLayers(map, Texture.WHITE).above.children).toHaveLength(0)
  })
})

describe('fixed step clock', () => {
  it('runs one tick per 1/60 s regardless of frame rate', () => {
    const at144 = createFixedStepClock()
    const at30 = createFixedStepClock()
    const ticks144 = Array.from({ length: 144 }, () => at144.advance(1000 / 144)).reduce(
      (a, b) => a + b,
      0,
    )
    const ticks30 = Array.from({ length: 30 }, () => at30.advance(1000 / 30)).reduce(
      (a, b) => a + b,
      0,
    )
    expect(ticks144).toBe(60)
    expect(ticks30).toBe(60)
  })

  it('carries leftover time and exposes the interpolation fraction', () => {
    const clock = createFixedStepClock(60)
    expect(clock.advance(10)).toBe(0)
    expect(clock.alpha()).toBeCloseTo(0.6, 5)
    expect(clock.advance(10)).toBe(1)
    expect(clock.alpha()).toBeCloseTo(0.2, 5)
  })

  it('bounds catch-up after a long stall instead of simulating it all', () => {
    const clock = createFixedStepClock(60, 5)
    expect(clock.advance(60_000)).toBe(5)
    expect(clock.advance(0)).toBe(0)
    expect(clock.alpha()).toBe(0)
  })

  it('ignores negative time and can be reset', () => {
    const clock = createFixedStepClock(60)
    clock.advance(10)
    expect(clock.advance(-1000)).toBe(0)
    clock.reset()
    expect(clock.alpha()).toBe(0)
  })
})

describe('texture provider', () => {
  const texture = () => new Texture({ source: new TextureSource({ width: 4, height: 4 }) })
  const blobOf = (text: string) => new Blob([text])

  const setup = () => {
    const requests: string[] = []
    const provider = createAssetTextureProvider({
      loadBlob: (path) => {
        // eslint-disable-next-line functional/immutable-data -- records requests
        requests.push(path)
        return Promise.resolve(blobOf(path))
      },
      decode: () => Promise.resolve(texture()),
    })
    return { provider, requests }
  }

  it('loads each path once and shares the texture and in-flight requests', async () => {
    const { provider, requests } = setup()
    const [a, b] = await Promise.all([provider.load('img/a.png'), provider.load('img/a.png')])
    expect(a).toBe(b)
    expect(await provider.load('img/a.png')).toBe(a)
    expect(requests).toEqual(['img/a.png'])
    expect(provider.get('img/a.png')).toBe(a)
    expect(provider.get('img/other.png')).toBeUndefined()
  })

  it('registers textures in the PixiJS asset cache under their project path', async () => {
    const { provider } = setup()
    const loaded = await provider.load('img/cached.png')
    expect(Assets.cache.get('img/cached.png')).toBe(loaded)
  })

  it('invalidation resets the PixiJS cache and makes the next load fetch again', async () => {
    const { provider, requests } = setup()
    const first = await provider.load('img/a.png')
    provider.invalidate()
    expect(provider.get('img/a.png')).toBeUndefined()
    expect(Assets.cache.has('img/a.png')).toBe(false)
    const second = await provider.load('img/a.png')
    expect(second).not.toBe(first)
    expect(requests).toEqual(['img/a.png', 'img/a.png'])
  })

  it('does not cache a result that was invalidated while it was loading', async () => {
    let release: (blob: Blob) => void = () => undefined
    const provider = createAssetTextureProvider({
      loadBlob: () =>
        new Promise<Blob>((resolve) => {
          release = resolve
        }),
      decode: () => Promise.resolve(texture()),
    })
    const stale = provider.load('img/a.png')
    provider.invalidate()
    release(blobOf('old'))
    await stale
    expect(provider.get('img/a.png')).toBeUndefined()
  })

  it('propagates load failures and allows a retry', async () => {
    let fail = true
    const provider = createAssetTextureProvider({
      loadBlob: () => (fail ? Promise.reject(new Error('404')) : Promise.resolve(blobOf('ok'))),
      decode: () => Promise.resolve(texture()),
    })
    await expect(provider.load('img/a.png')).rejects.toThrow('404')
    fail = false
    await expect(provider.load('img/a.png')).resolves.toBeDefined()
  })
})
