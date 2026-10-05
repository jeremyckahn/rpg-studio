import { CollisionFlags } from '@rpgstudio/core'
import { describe, expect, it } from 'vitest'

import { centeredPan, clampPan, lineCells, panForZoom, screenToTile } from '../src/canvas/geometry'
import { type PaintContext, createPaintController } from '../src/canvas/tools'
import { createEditorStore, redo, undo } from '../src/store'
import { sampleProject } from './helpers'

describe('screenToTile', () => {
  it('accounts for pan, zoom and tile size', () => {
    expect(screenToTile({ x: 0, y: 0 }, { x: 0, y: 0 }, 1, 16)).toEqual({ x: 0, y: 0 })
    expect(screenToTile({ x: 47, y: 15 }, { x: 0, y: 0 }, 1, 16)).toEqual({ x: 2, y: 0 })
    expect(screenToTile({ x: 96, y: 64 }, { x: 0, y: 0 }, 2, 16)).toEqual({ x: 3, y: 2 })
    expect(screenToTile({ x: 100, y: 100 }, { x: 36, y: 4 }, 4, 16)).toEqual({ x: 1, y: 1 })
  })

  it('maps screen points left of or above the map to negative tiles', () => {
    expect(screenToTile({ x: 5, y: 5 }, { x: 40, y: 40 }, 1, 16)).toEqual({ x: -3, y: -3 })
  })
})

describe('zooming about a point', () => {
  it('keeps the map point under the cursor stationary', () => {
    const anchor = { x: 200, y: 120 }
    const pan = { x: 30, y: -10 }
    const next = panForZoom(anchor, pan, 2, 4)
    const mapPointBefore = { x: (anchor.x - pan.x) / 2, y: (anchor.y - pan.y) / 2 }
    const mapPointAfter = { x: (anchor.x - next.x) / 4, y: (anchor.y - next.y) / 4 }
    expect(mapPointAfter).toEqual(mapPointBefore)
  })

  it('does not move when the zoom does not change', () => {
    expect(panForZoom({ x: 5, y: 5 }, { x: 7, y: 9 }, 3, 3)).toEqual({ x: 7, y: 9 })
  })
})

describe('pan limits', () => {
  const map = { width: 320, height: 240 }
  const view = { width: 800, height: 600 }

  it('keeps part of the map reachable', () => {
    expect(clampPan({ x: -10_000, y: -10_000 }, map, 2, view, 64)).toEqual({
      x: 64 - 640,
      y: 64 - 480,
    })
    expect(clampPan({ x: 10_000, y: 10_000 }, map, 2, view, 64)).toEqual({ x: 736, y: 536 })
    expect(clampPan({ x: 100, y: 100 }, map, 2, view, 64)).toEqual({ x: 100, y: 100 })
  })

  it('centres a map in the view', () => {
    expect(centeredPan(map, 2, view)).toEqual({ x: 80, y: 60 })
    expect(centeredPan(map, 4, view)).toEqual({ x: -240, y: -180 })
  })
})

describe('lineCells', () => {
  it('returns the single cell for a point', () => {
    expect(lineCells({ x: 2, y: 3 }, { x: 2, y: 3 })).toEqual([{ x: 2, y: 3 }])
  })

  it('walks horizontal, vertical and diagonal lines in either direction', () => {
    expect(lineCells({ x: 0, y: 0 }, { x: 3, y: 0 })).toEqual(
      [0, 1, 2, 3].map((x) => ({ x, y: 0 })),
    )
    expect(lineCells({ x: 1, y: 3 }, { x: 1, y: 0 })).toEqual(
      [3, 2, 1, 0].map((y) => ({ x: 1, y })),
    )
    expect(lineCells({ x: 0, y: 0 }, { x: 3, y: 3 })).toEqual(
      [0, 1, 2, 3].map((n) => ({ x: n, y: n })),
    )
    expect(lineCells({ x: 3, y: 3 }, { x: 0, y: 0 })).toEqual(
      [3, 2, 1, 0].map((n) => ({ x: n, y: n })),
    )
  })

  it('leaves no gaps on a shallow line: every step moves at most one cell on each axis', () => {
    const cells = lineCells({ x: 0, y: 0 }, { x: 9, y: 4 })
    expect(cells[0]).toEqual({ x: 0, y: 0 })
    expect(cells.at(-1)).toEqual({ x: 9, y: 4 })
    cells.slice(1).forEach((cell, i) => {
      const previous = cells[i]
      expect(Math.abs(cell.x - (previous?.x ?? 0))).toBeLessThanOrEqual(1)
      expect(Math.abs(cell.y - (previous?.y ?? 0))).toBeLessThanOrEqual(1)
    })
    expect(cells).toHaveLength(10)
  })
})

describe('paint controller', () => {
  const setup = (overrides: Partial<PaintContext> = {}) => {
    const handle = createEditorStore({ project: sampleProject() })
    const getContext = (): PaintContext => {
      const map = handle.store.getState().project.data.maps[0]
      if (!map) throw new Error('no map')
      return { map, layer: 0, tool: 'pencil', tile: 5, ...overrides }
    }
    const controller = createPaintController(handle.store.dispatch, getContext)
    const tiles = (layer = 0) =>
      handle.store.getState().project.data.maps[0]?.layers[layer]?.data ?? []
    const collision = () => handle.store.getState().project.data.maps[0]?.collision ?? []
    return { handle, controller, tiles, collision }
  }

  it('paints the clicked cell with the selected tile', () => {
    const { controller, tiles } = setup()
    controller.pointerDown({ x: 2, y: 1 })
    controller.pointerUp()
    expect(tiles()[1 * 6 + 2]).toBe(5)
    expect(tiles().filter((t) => t === 5)).toHaveLength(1)
  })

  it('paints a continuous stroke with no gaps even when the pointer jumps', () => {
    const { controller, tiles } = setup()
    controller.pointerDown({ x: 0, y: 0 })
    controller.pointerMove({ x: 5, y: 0 })
    controller.pointerUp()
    expect([0, 1, 2, 3, 4, 5].map((x) => tiles()[x])).toEqual([5, 5, 5, 5, 5, 5])
  })

  it('undoes an entire stroke in one step', () => {
    const { handle, controller, tiles } = setup()
    controller.pointerDown({ x: 0, y: 0 })
    ;[1, 2, 3].forEach((x) => controller.pointerMove({ x, y: 0 }))
    controller.pointerUp()
    expect(tiles().slice(0, 4)).toEqual([5, 5, 5, 5])
    handle.store.dispatch(undo())
    expect(tiles().slice(0, 4)).toEqual([1, 1, 1, 1])
    handle.store.dispatch(redo())
    expect(tiles().slice(0, 4)).toEqual([5, 5, 5, 5])
  })

  it('makes two strokes two undo steps', () => {
    const { handle, controller, tiles } = setup()
    controller.pointerDown({ x: 0, y: 0 })
    controller.pointerUp()
    controller.pointerDown({ x: 1, y: 0 })
    controller.pointerUp()
    handle.store.dispatch(undo())
    expect(tiles().slice(0, 2)).toEqual([5, 1])
    handle.store.dispatch(undo())
    expect(tiles().slice(0, 2)).toEqual([1, 1])
  })

  it('ignores movement when no stroke is active and clicks outside the map', () => {
    const { handle, controller, tiles } = setup()
    const before = handle.store.getState().project
    controller.pointerMove({ x: 1, y: 1 })
    controller.pointerDown({ x: -1, y: 0 })
    controller.pointerDown({ x: 6, y: 0 })
    expect(controller.active()).toBe(false)
    expect(handle.store.getState().project).toBe(before)
    expect(tiles().every((t) => t === 1)).toBe(true)
  })

  it('does not paint cells that a stroke drags outside the map', () => {
    const { controller, tiles } = setup()
    controller.pointerDown({ x: 4, y: 0 })
    controller.pointerMove({ x: 9, y: 0 })
    controller.pointerUp()
    expect([4, 5].map((x) => tiles()[x])).toEqual([5, 5])
    expect(tiles()).toHaveLength(24)
  })

  it('erases with tile 0 on the selected layer only', () => {
    const { controller, tiles } = setup({ tool: 'eraser' })
    controller.pointerDown({ x: 0, y: 0 })
    controller.pointerUp()
    expect(tiles()[0]).toBe(0)
    expect(tiles(1)[0]).toBe(0)
    expect(tiles()[1]).toBe(1)
  })

  it('paints on the selected layer', () => {
    const { controller, tiles } = setup({ layer: 1 })
    controller.pointerDown({ x: 3, y: 2 })
    controller.pointerUp()
    expect(tiles(1)[2 * 6 + 3]).toBe(5)
    expect(tiles(0)[2 * 6 + 3]).toBe(1)
  })

  it('flood fills a region with one click and one undo step', () => {
    const { handle, controller, tiles } = setup({ tool: 'fill', tile: 7 })
    controller.pointerDown({ x: 3, y: 2 })
    expect(controller.active()).toBe(false) // fill is not a drag
    expect(tiles().every((t) => t === 7)).toBe(true)
    handle.store.dispatch(undo())
    expect(tiles().every((t) => t === 1)).toBe(true)
  })

  it('collision tool makes cells solid, and the first cell decides the mode of the stroke', () => {
    const { handle, controller, collision } = setup({ tool: 'collision' })
    controller.pointerDown({ x: 0, y: 0 })
    controller.pointerMove({ x: 3, y: 0 })
    controller.pointerUp()
    expect(collision().slice(0, 5)).toEqual([1, 1, 1, 1, 0])
    // Starting on a solid cell clears solidity along the stroke instead.
    controller.pointerDown({ x: 1, y: 0 })
    controller.pointerMove({ x: 4, y: 0 })
    controller.pointerUp()
    expect(collision().slice(0, 5)).toEqual([1, 0, 0, 0, 0])
    handle.store.dispatch(undo())
    expect(collision().slice(0, 5)).toEqual([1, 1, 1, 1, 0])
    expect(CollisionFlags.SOLID).toBe(1)
  })
})
