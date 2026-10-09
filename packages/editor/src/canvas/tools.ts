import { CollisionFlags, type Point, type Tilemap, inBounds } from '@rpgstudio/core'

import { type AppDispatch } from '../store/index.ts'
import { type MapTool, editorUiSlice } from '../store/slices/editorUi.ts'
import { projectActions } from '../store/slices/project.ts'
import { lineCells } from './geometry.ts'

export interface PaintContext {
  readonly map: Tilemap
  readonly layer: number
  readonly tool: MapTool
  /** Tile id the pencil and fill paint with. */
  readonly tile: number
}

export interface PaintController {
  pointerDown: (cell: Point) => void
  pointerMove: (cell: Point) => void
  pointerUp: () => void
  /** True while a stroke is in progress. */
  active: () => boolean
}

interface Stroke {
  /** History group: everything in one stroke undoes as a single step. */
  readonly group: string
  readonly last: Point
  /** Collision strokes either paint solid cells or clear them, decided by the first cell. */
  readonly collisionFlags: number
  readonly seen: ReadonlySet<string>
}

const key = (cell: Point): string => `${cell.x},${cell.y}`

/**
 * Turns pointer input on the map into project actions.
 *
 * - **Pencil / eraser**: one `setTiles` per pointer move, joined to the previous
 *   cell by a line so fast strokes leave no gaps.
 * - **Fill**: one `floodFill` on click.
 * - **Collision**: the first cell decides whether the stroke makes cells solid or
 *   clears them; dragging applies the same to every new cell.
 *
 * All actions of a stroke share a history group, so Undo reverts the whole stroke.
 */
export const createPaintController = (
  dispatch: AppDispatch,
  getContext: () => PaintContext,
): PaintController => {
  const prefix = Math.random().toString(36).slice(2, 8)
  let counter = 0
  let stroke: Stroke | null = null

  const solidAt = (map: Tilemap, cell: Point): boolean =>
    ((map.collision[cell.y * map.width + cell.x] ?? 0) & CollisionFlags.SOLID) !== 0

  const paint = (current: Stroke, cells: readonly Point[]): void => {
    const { map, layer, tool, tile } = getContext()
    const fresh = cells.filter((cell) => inBounds(map, cell) && !current.seen.has(key(cell)))
    if (fresh.length === 0) return

    if (tool === 'collision') {
      dispatch(
        projectActions.setCollision(
          {
            mapId: map.id,
            cells: fresh.map((cell) => ({ ...cell, flags: current.collisionFlags })),
          },
          current.group,
        ),
      )
    } else {
      dispatch(
        projectActions.setTiles(
          {
            mapId: map.id,
            layer,
            cells: fresh.map((cell) => ({ ...cell, tile: tool === 'eraser' ? 0 : tile })),
          },
          current.group,
        ),
      )
    }
  }

  return {
    active: () => stroke !== null,

    pointerDown: (cell) => {
      const { map, layer, tool, tile } = getContext()
      if (!inBounds(map, cell)) return
      if (tool === 'play') {
        // Not an edit: nothing to undo, and no stroke to continue.
        dispatch(editorUiSlice.actions.previewStartChosen({ mapId: map.id, x: cell.x, y: cell.y }))
        return
      }
      counter += 1
      const group = `${prefix}-${counter}`

      if (tool === 'fill') {
        dispatch(
          projectActions.floodFill({ mapId: map.id, layer, x: cell.x, y: cell.y, tile }, group),
        )
        return
      }
      const begun: Stroke = {
        group,
        last: cell,
        collisionFlags: solidAt(map, cell) ? CollisionFlags.PASSABLE : CollisionFlags.SOLID,
        seen: new Set(),
      }
      paint(begun, [cell])
      stroke = { ...begun, seen: new Set([key(cell)]) }
    },

    pointerMove: (cell) => {
      if (!stroke || (cell.x === stroke.last.x && cell.y === stroke.last.y)) return
      const path = lineCells(stroke.last, cell)
      const { tool } = getContext()
      // Pencil and eraser may repaint a cell; only collision strokes skip repeats.
      paint(tool === 'collision' ? stroke : { ...stroke, seen: new Set() }, path)
      stroke = { ...stroke, last: cell, seen: new Set([...stroke.seen, ...path.map(key)]) }
    },

    pointerUp: () => {
      stroke = null
    },
  }
}
