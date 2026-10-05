import { type Direction } from '@rpgstudio/core'

import { type Entity } from '../ecs/entity.ts'

/** Where an entity is drawn, in tiles, interpolated part way through a step. */
export const visualTile = (entity: Entity): { x: number; y: number } | undefined => {
  const { position, movement } = entity
  if (!position) return undefined
  if (!movement?.target) return { x: position.x, y: position.y }
  return {
    x: position.x + (movement.target.x - position.x) * movement.progress,
    y: position.y + (movement.target.y - position.y) * movement.progress,
  }
}

/** Row of a character sheet for each facing, in the common RPG layout. */
const SHEET_ROWS: Readonly<Record<Direction, number>> = { down: 0, left: 1, right: 2, up: 3 }

/**
 * Picks the frame of a character sheet. A sheet with at least 3 columns and
 * 4 rows is read in the common RPG layout (rows: down, left, right, up;
 * columns: step, stand, step). Anything smaller is a single static frame.
 */
export const walkFrameIndex = (
  direction: Direction,
  moving: boolean,
  progress: number,
  columns: number,
  rows: number,
): number => {
  if (columns < 3 || rows < 4) return 0
  const column = !moving ? 1 : progress < 0.5 ? 0 : 2
  return SHEET_ROWS[direction] * columns + column
}
