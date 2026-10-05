import { createRng } from '../math/rng.ts'
import { type RgbaImage } from './matrix.ts'
import { encodePng } from './png.ts'

export const DEFAULT_TILESET_PATH = 'img/tilesets/basic.png'
export const DEFAULT_TILE_SIZE = 16
export const DEFAULT_TILESET_COLUMNS = 8

type Rgb = readonly [number, number, number]

interface TileDefinition {
  readonly name: string
  /** Whether painting this tile should default the cell to solid. */
  readonly solid: boolean
  readonly base: Rgb
  readonly accent: Rgb
  /** Chooses between `base` and `accent` for a pixel, given noise in [0, 1). */
  readonly pattern: (x: number, y: number, noise: number) => 'base' | 'accent'
}

const noisy =
  (threshold: number): TileDefinition['pattern'] =>
  (_x, _y, noise) =>
    noise > threshold ? 'accent' : 'base'

const bricks: TileDefinition['pattern'] = (x, y) => {
  const row = Math.floor(y / 4)
  return y % 4 === 3 || (x + (row % 2) * 4) % 8 === 7 ? 'accent' : 'base'
}

const planks: TileDefinition['pattern'] = (x, y) =>
  y % 4 === 3 || (x === 7 && y % 8 < 4) ? 'accent' : 'base'

const waves: TileDefinition['pattern'] = (x, y) => ((x + y * 2) % 8 < 2 ? 'accent' : 'base')

const dots =
  (every: number): TileDefinition['pattern'] =>
  (x, y) =>
    x % every === 1 && y % every === 1 ? 'accent' : 'base'

const disc: TileDefinition['pattern'] = (x, y) =>
  (x - 7.5) ** 2 + (y - 7.5) ** 2 < 36 ? 'accent' : 'base'

const TILES: readonly TileDefinition[] = [
  { name: 'Grass', solid: false, base: [74, 156, 70], accent: [92, 178, 84], pattern: noisy(0.8) },
  { name: 'Dirt', solid: false, base: [140, 98, 62], accent: [122, 82, 50], pattern: noisy(0.7) },
  { name: 'Water', solid: true, base: [52, 110, 200], accent: [110, 160, 235], pattern: waves },
  {
    name: 'Sand',
    solid: false,
    base: [222, 202, 140],
    accent: [204, 182, 120],
    pattern: noisy(0.85),
  },
  {
    name: 'Stone floor',
    solid: false,
    base: [140, 140, 148],
    accent: [118, 118, 128],
    pattern: bricks,
  },
  { name: 'Wall', solid: true, base: [96, 96, 108], accent: [60, 60, 72], pattern: bricks },
  { name: 'Tree', solid: true, base: [74, 156, 70], accent: [30, 100, 46], pattern: disc },
  { name: 'Flowers', solid: false, base: [74, 156, 70], accent: [240, 90, 140], pattern: dots(5) },
  {
    name: 'Wood floor',
    solid: false,
    base: [176, 124, 76],
    accent: [140, 96, 56],
    pattern: planks,
  },
  {
    name: 'Door',
    solid: false,
    base: [120, 74, 38],
    accent: [236, 190, 60],
    pattern: (x, y) => (x === 11 && y === 8 ? 'accent' : 'base'),
  },
  { name: 'Bridge', solid: false, base: [160, 112, 66], accent: [110, 76, 44], pattern: planks },
  { name: 'Lava', solid: true, base: [214, 74, 30], accent: [250, 190, 50], pattern: waves },
  {
    name: 'Snow',
    solid: false,
    base: [238, 242, 250],
    accent: [208, 220, 238],
    pattern: noisy(0.85),
  },
  {
    name: 'Cobblestone',
    solid: false,
    base: [128, 124, 120],
    accent: [92, 88, 84],
    pattern: dots(4),
  },
  {
    name: 'Chest',
    solid: true,
    base: [150, 96, 40],
    accent: [250, 210, 70],
    pattern: (x, y) => (y === 7 || (x > 6 && x < 9 && y > 5 && y < 10) ? 'accent' : 'base'),
  },
  { name: 'Pit', solid: true, base: [24, 20, 30], accent: [44, 38, 54], pattern: noisy(0.7) },
]

/** Tile metadata for the built-in tileset, in tile-id order (id = index + 1). */
export const DEFAULT_TILES: readonly { readonly name: string; readonly solid: boolean }[] =
  TILES.map(({ name, solid }) => ({ name, solid }))

const renderTile = (
  tile: TileDefinition,
  seed: number,
): readonly (readonly [number, number, number, number])[] => {
  const rng = createRng(seed)
  return Array.from({ length: DEFAULT_TILE_SIZE * DEFAULT_TILE_SIZE }, (_, i) => {
    const x = i % DEFAULT_TILE_SIZE
    const y = Math.floor(i / DEFAULT_TILE_SIZE)
    const [r, g, b] = tile[tile.pattern(x, y, rng.next())]
    return [r, g, b, 255] as const
  })
}

/** The built-in 16x16 tileset as raw RGBA, generated deterministically. */
export const createDefaultTilesetImage = (): RgbaImage => {
  const columns = DEFAULT_TILESET_COLUMNS
  const rows = Math.ceil(TILES.length / columns)
  const width = columns * DEFAULT_TILE_SIZE
  const height = rows * DEFAULT_TILE_SIZE
  const tiles = TILES.map((tile, index) => renderTile(tile, 1000 + index))
  const data = Uint8Array.from({ length: width * height * 4 }, (_, offset) => {
    const pixel = Math.floor(offset / 4)
    const x = pixel % width
    const y = Math.floor(pixel / width)
    const tileIndex =
      Math.floor(y / DEFAULT_TILE_SIZE) * columns + Math.floor(x / DEFAULT_TILE_SIZE)
    const color =
      tiles[tileIndex]?.[(y % DEFAULT_TILE_SIZE) * DEFAULT_TILE_SIZE + (x % DEFAULT_TILE_SIZE)]
    return color?.[offset % 4] ?? 0
  })
  return { width, height, data }
}

export const createDefaultTilesetPng = (): Uint8Array => encodePng(createDefaultTilesetImage())
