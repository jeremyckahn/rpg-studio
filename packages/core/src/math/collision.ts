import { CollisionFlags } from '../schemas/tilemap.ts'
import { type Direction, type Point } from '../schemas/common.ts'
import { type GridSize, cellIndex, inBounds, oppositeDirection, stepTile } from './grid.ts'

export interface CollisionGrid extends GridSize {
  /** Row-major collision bit flags. */
  readonly collision: readonly number[]
}

const BLOCK_FLAG: Readonly<Record<Direction, number>> = {
  up: CollisionFlags.BLOCK_UP,
  down: CollisionFlags.BLOCK_DOWN,
  left: CollisionFlags.BLOCK_LEFT,
  right: CollisionFlags.BLOCK_RIGHT,
}

export const collisionFlagsAt = (grid: CollisionGrid, cell: Point): number =>
  inBounds(grid, cell)
    ? (grid.collision[cellIndex(grid, cell)] ?? CollisionFlags.SOLID)
    : CollisionFlags.SOLID

export const isSolidCell = (grid: CollisionGrid, cell: Point): boolean =>
  (collisionFlagsAt(grid, cell) & CollisionFlags.SOLID) !== 0

/**
 * Whether an entity standing on `from` may take one step in `direction`.
 * Considers the map edge, solid destination cells, and the directional block
 * flags of both the cell being left and the cell being entered.
 */
export const canStep = (grid: CollisionGrid, from: Point, direction: Direction): boolean => {
  const to = stepTile(from, direction)
  if (!inBounds(grid, to) || isSolidCell(grid, to)) return false
  if ((collisionFlagsAt(grid, from) & BLOCK_FLAG[direction]) !== 0) return false
  return (collisionFlagsAt(grid, to) & BLOCK_FLAG[oppositeDirection(direction)]) === 0
}
