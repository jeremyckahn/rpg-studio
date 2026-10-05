import { type Direction, type Point } from '../schemas/common.ts'

export interface Rect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export const DIRECTIONS = ['up', 'down', 'left', 'right'] as const satisfies readonly Direction[]

export const DIRECTION_VECTORS: Readonly<Record<Direction, Point>> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
}

const OPPOSITES: Readonly<Record<Direction, Direction>> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
}

export const oppositeDirection = (direction: Direction): Direction => OPPOSITES[direction]

/** The tile one step from `from` in `direction`. */
export const stepTile = (from: Point, direction: Direction): Point => {
  const vector = DIRECTION_VECTORS[direction]
  return { x: from.x + vector.x, y: from.y + vector.y }
}

/** The direction of a single-tile step, or `undefined` if not a cardinal step. */
export const directionBetween = (from: Point, to: Point): Direction | undefined =>
  DIRECTIONS.find((direction) => {
    const vector = DIRECTION_VECTORS[direction]
    return from.x + vector.x === to.x && from.y + vector.y === to.y
  })

export const pointsEqual = (a: Point, b: Point): boolean => a.x === b.x && a.y === b.y

export const manhattanDistance = (a: Point, b: Point): number =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y)

/** World (pixel) position of a tile's top-left corner. */
export const tileToWorld = (tile: Point, tileSize: number): Point => ({
  x: tile.x * tileSize,
  y: tile.y * tileSize,
})

/** World (pixel) position of a tile's centre. */
export const tileCenterToWorld = (tile: Point, tileSize: number): Point => ({
  x: tile.x * tileSize + tileSize / 2,
  y: tile.y * tileSize + tileSize / 2,
})

/** The tile containing a world (pixel) position. */
export const worldToTile = (
  world: { readonly x: number; readonly y: number },
  tileSize: number,
): Point => ({
  x: Math.floor(world.x / tileSize),
  y: Math.floor(world.y / tileSize),
})

/** The pixel-space rectangle covered by a tile. */
export const tileBounds = (tile: Point, tileSize: number): Rect => ({
  x: tile.x * tileSize,
  y: tile.y * tileSize,
  width: tileSize,
  height: tileSize,
})

/** Whether `point` lies in the half-open rectangle `[x, x + width) x [y, y + height)`. */
export const rectContainsPoint = (
  rect: Rect,
  point: { readonly x: number; readonly y: number },
): boolean =>
  point.x >= rect.x &&
  point.x < rect.x + rect.width &&
  point.y >= rect.y &&
  point.y < rect.y + rect.height

/** Whether two half-open rectangles overlap. Rectangles that merely touch do not. */
export const rectsIntersect = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y

/** The overlap of two rectangles, or `null` if they do not intersect. */
export const rectIntersection = (a: Rect, b: Rect): Rect | null => {
  if (!rectsIntersect(a, b)) return null
  const x = Math.max(a.x, b.x)
  const y = Math.max(a.y, b.y)
  return {
    x,
    y,
    width: Math.min(a.x + a.width, b.x + b.width) - x,
    height: Math.min(a.y + a.height, b.y + b.height) - y,
  }
}

export interface GridSize {
  readonly width: number
  readonly height: number
}

export const inBounds = (size: GridSize, point: Point): boolean =>
  point.x >= 0 && point.y >= 0 && point.x < size.width && point.y < size.height

/** Row-major index of a cell. Does not bounds-check. */
export const cellIndex = (size: GridSize, point: Point): number => point.y * size.width + point.x

/** All cells of the inclusive rectangle between two corners, clamped to the grid. */
export const cellsInRect = (size: GridSize, a: Point, b: Point): Point[] => {
  const x0 = Math.max(0, Math.min(a.x, b.x))
  const x1 = Math.min(size.width - 1, Math.max(a.x, b.x))
  const y0 = Math.max(0, Math.min(a.y, b.y))
  const y1 = Math.min(size.height - 1, Math.max(a.y, b.y))
  const cols = Math.max(0, x1 - x0 + 1)
  const rows = Math.max(0, y1 - y0 + 1)
  return Array.from({ length: cols * rows }, (_, i) => ({
    x: x0 + (i % cols),
    y: y0 + Math.floor(i / cols),
  }))
}
