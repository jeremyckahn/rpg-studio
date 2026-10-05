import { describe, expect, it } from 'vitest'

import {
  CollisionFlags,
  type Direction,
  type Point,
  canStep,
  cellIndex,
  cellsInRect,
  createRng,
  directionBetween,
  findPath,
  inBounds,
  manhattanDistance,
  oppositeDirection,
  rectContainsPoint,
  rectIntersection,
  rectsIntersect,
  stepTile,
  tileBounds,
  tileCenterToWorld,
  tileToWorld,
  worldToTile,
} from '../src'

describe('grid math', () => {
  it('converts tiles to world pixels and back', () => {
    expect(tileToWorld({ x: 3, y: 2 }, 16)).toEqual({ x: 48, y: 32 })
    expect(tileCenterToWorld({ x: 3, y: 2 }, 16)).toEqual({ x: 56, y: 40 })
    expect(worldToTile({ x: 48, y: 32 }, 16)).toEqual({ x: 3, y: 2 })
    expect(worldToTile({ x: 63.99, y: 47.5 }, 16)).toEqual({ x: 3, y: 2 })
  })

  it('floors negative world coordinates toward negative infinity', () => {
    expect(worldToTile({ x: -0.5, y: -16 }, 16)).toEqual({ x: -1, y: -1 })
    expect(worldToTile({ x: -16.01, y: 0 }, 16)).toEqual({ x: -2, y: 0 })
  })

  it('round-trips every tile size for every tile in a window', () => {
    ;[16, 24, 32, 48].forEach((size) => {
      cellsInRect({ width: 10, height: 10 }, { x: 0, y: 0 }, { x: 9, y: 9 }).forEach((tile) => {
        expect(worldToTile(tileToWorld(tile, size), size)).toEqual(tile)
        expect(worldToTile(tileCenterToWorld(tile, size), size)).toEqual(tile)
      })
    })
  })

  it('steps and measures between tiles', () => {
    expect(stepTile({ x: 2, y: 2 }, 'up')).toEqual({ x: 2, y: 1 })
    expect(stepTile({ x: 2, y: 2 }, 'right')).toEqual({ x: 3, y: 2 })
    expect(oppositeDirection('left')).toBe('right')
    expect(directionBetween({ x: 1, y: 1 }, { x: 1, y: 2 })).toBe('down')
    expect(directionBetween({ x: 1, y: 1 }, { x: 2, y: 2 })).toBeUndefined()
    expect(manhattanDistance({ x: 0, y: 0 }, { x: -3, y: 4 })).toBe(7)
  })

  it('checks bounds and indexes row-major', () => {
    const size = { width: 4, height: 3 }
    expect(inBounds(size, { x: 3, y: 2 })).toBe(true)
    expect(inBounds(size, { x: 4, y: 0 })).toBe(false)
    expect(inBounds(size, { x: 0, y: -1 })).toBe(false)
    expect(cellIndex(size, { x: 1, y: 2 })).toBe(9)
  })

  it('treats rectangles as half-open for containment and intersection', () => {
    const a = { x: 0, y: 0, width: 16, height: 16 }
    expect(rectContainsPoint(a, { x: 0, y: 0 })).toBe(true)
    expect(rectContainsPoint(a, { x: 15.9, y: 15.9 })).toBe(true)
    expect(rectContainsPoint(a, { x: 16, y: 0 })).toBe(false)
    expect(rectsIntersect(a, { x: 16, y: 0, width: 16, height: 16 })).toBe(false)
    expect(rectsIntersect(a, { x: 15, y: 15, width: 16, height: 16 })).toBe(true)
    expect(rectIntersection(a, { x: 8, y: 4, width: 16, height: 16 })).toEqual({
      x: 8,
      y: 4,
      width: 8,
      height: 12,
    })
    expect(rectIntersection(a, tileBounds({ x: 5, y: 5 }, 16))).toBeNull()
  })

  it('enumerates rectangle cells in row-major order, clamped to the grid', () => {
    const size = { width: 4, height: 4 }
    expect(cellsInRect(size, { x: 1, y: 1 }, { x: 2, y: 2 })).toEqual([
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 1, y: 2 },
      { x: 2, y: 2 },
    ])
    expect(cellsInRect(size, { x: 2, y: 2 }, { x: 1, y: 1 })).toHaveLength(4)
    expect(cellsInRect(size, { x: -5, y: -5 }, { x: 99, y: 0 })).toHaveLength(4)
    expect(cellsInRect(size, { x: 10, y: 10 }, { x: 12, y: 12 })).toEqual([])
  })
})

const gridFrom = (rows: readonly string[]) => ({
  width: rows[0]?.length ?? 0,
  height: rows.length,
  collision: rows.flatMap((row) =>
    [...row].map((c) => (c === '#' ? CollisionFlags.SOLID : CollisionFlags.PASSABLE)),
  ),
})

describe('collision', () => {
  it('blocks the map edge and solid cells', () => {
    const grid = gridFrom(['.#', '..'])
    expect(canStep(grid, { x: 0, y: 0 }, 'right')).toBe(false)
    expect(canStep(grid, { x: 0, y: 0 }, 'left')).toBe(false)
    expect(canStep(grid, { x: 0, y: 0 }, 'up')).toBe(false)
    expect(canStep(grid, { x: 0, y: 0 }, 'down')).toBe(true)
  })

  it('honours directional block flags on both sides of an edge', () => {
    const grid = {
      width: 2,
      height: 1,
      collision: [CollisionFlags.BLOCK_RIGHT, CollisionFlags.PASSABLE],
    }
    expect(canStep(grid, { x: 0, y: 0 }, 'right')).toBe(false) // leaving a right-blocked cell
    const ledge = {
      width: 2,
      height: 1,
      collision: [CollisionFlags.PASSABLE, CollisionFlags.BLOCK_LEFT],
    }
    expect(canStep(ledge, { x: 0, y: 0 }, 'right')).toBe(false) // entering a cell from its blocked side
    expect(canStep(ledge, { x: 1, y: 0 }, 'left')).toBe(false)
  })
})

describe('findPath', () => {
  const pathOn = (rows: readonly string[], start: Point, goal: Point, maxIterations?: number) => {
    const grid = gridFrom(rows)
    return findPath({
      ...grid,
      start,
      goal,
      canStep: (from: Point, direction: Direction) => canStep(grid, from, direction),
      ...(maxIterations === undefined ? {} : { maxIterations }),
    })
  }

  it('returns just the start when already there', () => {
    expect(pathOn(['...'], { x: 1, y: 0 }, { x: 1, y: 0 })).toEqual([{ x: 1, y: 0 }])
  })

  it('finds a shortest straight path including both endpoints', () => {
    const path = pathOn(['.....'], { x: 0, y: 0 }, { x: 4, y: 0 })
    expect(path).toHaveLength(5)
    expect(path?.[0]).toEqual({ x: 0, y: 0 })
    expect(path?.at(-1)).toEqual({ x: 4, y: 0 })
  })

  it('routes around walls', () => {
    const path = pathOn(['..#..', '..#..', '.....', '..#..'], { x: 0, y: 0 }, { x: 4, y: 0 })
    expect(path).not.toBeNull()
    expect(path).toHaveLength(9) // down 2, across 4, up 2 = 8 steps
    path?.forEach((cell) => expect(cell.x === 2 && cell.y < 2).toBe(false))
  })

  it('moves only in single orthogonal steps', () => {
    const path = pathOn(['.....', '.....', '.....'], { x: 0, y: 0 }, { x: 4, y: 2 }) ?? []
    path.slice(1).forEach((cell, index) => {
      const previous = path[index] as Point
      expect(manhattanDistance(previous, cell)).toBe(1)
    })
    expect(path).toHaveLength(7)
  })

  it('returns null when the goal is walled off or out of bounds', () => {
    expect(pathOn(['.#.', '.#.'], { x: 0, y: 0 }, { x: 2, y: 0 })).toBeNull()
    expect(pathOn(['...'], { x: 0, y: 0 }, { x: 9, y: 0 })).toBeNull()
    expect(pathOn(['...'], { x: -1, y: 0 }, { x: 2, y: 0 })).toBeNull()
  })

  it('respects directional ledges that only allow one-way travel', () => {
    const grid = { width: 3, height: 1, collision: [0, CollisionFlags.BLOCK_LEFT, 0] }
    const find = (start: Point, goal: Point) =>
      findPath({
        ...grid,
        start,
        goal,
        canStep: (from, direction) => canStep(grid, from, direction),
      })
    expect(find({ x: 0, y: 0 }, { x: 2, y: 0 })).toBeNull() // cannot enter the ledge cell from the left
    expect(find({ x: 2, y: 0 }, { x: 0, y: 0 })).toBeNull() // nor leave it to the left
  })

  it('honours goalReachable and maxIterations', () => {
    const grid = gridFrom(['....'])
    const base = {
      ...grid,
      start: { x: 0, y: 0 },
      goal: { x: 3, y: 0 },
      canStep: (f: Point, d: Direction) => canStep(grid, f, d),
    }
    expect(findPath({ ...base, goalReachable: () => false })).toBeNull()
    expect(findPath({ ...base, maxIterations: 2 })).toBeNull()
    expect(findPath({ ...base, maxIterations: 10 })).toHaveLength(4)
  })

  it('is deterministic', () => {
    const rows = ['.....', '.#.#.', '.....', '.#.#.', '.....']
    const first = pathOn(rows, { x: 0, y: 0 }, { x: 4, y: 4 })
    expect(pathOn(rows, { x: 0, y: 0 }, { x: 4, y: 4 })).toEqual(first)
  })

  it('handles a large open map within the iteration budget', () => {
    const rows = Array.from({ length: 64 }, () => '.'.repeat(64))
    expect(pathOn(rows, { x: 0, y: 0 }, { x: 63, y: 63 })).toHaveLength(127)
  })
})

describe('rng', () => {
  it('produces identical sequences for identical seeds', () => {
    const a = createRng(42)
    const b = createRng(42)
    expect(Array.from({ length: 20 }, () => a.next())).toEqual(
      Array.from({ length: 20 }, () => b.next()),
    )
  })

  it('differs across seeds and stays within [0, 1)', () => {
    const a = createRng(1)
    const b = createRng(2)
    expect(a.next()).not.toBe(b.next())
    const values = Array.from({ length: 1000 }, () => a.next())
    expect(values.every((value) => value >= 0 && value < 1)).toBe(true)
  })

  it('resumes exactly from a saved state', () => {
    const original = createRng(7)
    Array.from({ length: 5 }, () => original.next())
    const resumed = createRng(original.getState())
    expect(Array.from({ length: 10 }, () => resumed.next())).toEqual(
      Array.from({ length: 10 }, () => original.next()),
    )
  })

  it('draws integers in range and covers every bucket', () => {
    const rng = createRng(99)
    const draws = Array.from({ length: 600 }, () => rng.nextInt(6))
    expect(new Set(draws)).toEqual(new Set([0, 1, 2, 3, 4, 5]))
    const ranged = Array.from({ length: 200 }, () => rng.range(-2, 2))
    expect(ranged.every((value) => value >= -2 && value <= 2 && Number.isInteger(value))).toBe(true)
  })

  it('picks elements and rejects invalid arguments', () => {
    const rng = createRng(3)
    expect(['a', 'b', 'c']).toContain(rng.pick(['a', 'b', 'c']))
    expect(() => rng.pick([])).toThrow(RangeError)
    expect(() => rng.nextInt(0)).toThrow(RangeError)
    expect(() => rng.nextInt(1.5)).toThrow(RangeError)
  })
})
