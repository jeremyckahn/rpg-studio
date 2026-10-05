/* eslint-disable functional/immutable-data --
   A* keeps its open heap and visited tables as scratch memory local to one
   call. Nothing escapes: the function is pure from the caller's point of view,
   and copying these structures on every expansion would make search quadratic. */
import { type Direction, type Point } from '../schemas/common.ts'
import {
  DIRECTIONS,
  type GridSize,
  inBounds,
  manhattanDistance,
  pointsEqual,
  stepTile,
} from './grid.ts'

export interface PathfindingOptions extends GridSize {
  readonly start: Point
  readonly goal: Point
  /**
   * Whether an entity at `from` may take a step in `direction`. Bounds are
   * checked by the finder before this is consulted. Use `canStep` from the
   * collision module for map collision.
   */
  readonly canStep: (from: Point, direction: Direction) => boolean
  /** Whether the goal itself may be occupied (e.g. false for a solid NPC). */
  readonly goalReachable?: (goal: Point) => boolean
  /** Upper bound on expanded nodes, guarding against pathological maps. */
  readonly maxIterations?: number
}

interface Node {
  readonly point: Point
  readonly g: number
  readonly f: number
  readonly parent: Node | null
}

/** Lower f first; among equals prefer deeper nodes, then lower cell index, for determinism. */
const precedes = (a: Node, b: Node, width: number): boolean =>
  a.f !== b.f
    ? a.f < b.f
    : a.g !== b.g
      ? a.g > b.g
      : a.point.y * width + a.point.x < b.point.y * width + b.point.x

const heapPush = (heap: Node[], node: Node, width: number): void => {
  heap.push(node)
  for (let child = heap.length - 1; child > 0;) {
    const parent = (child - 1) >> 1
    const childNode = heap[child] as Node
    const parentNode = heap[parent] as Node
    if (!precedes(childNode, parentNode, width)) break
    heap[child] = parentNode
    heap[parent] = childNode
    child = parent
  }
}

const heapPop = (heap: Node[], width: number): Node | undefined => {
  const top = heap[0]
  const last = heap.pop()
  if (top === undefined || last === undefined) return top
  if (heap.length === 0) return top
  heap[0] = last
  for (let parent = 0; ;) {
    const left = parent * 2 + 1
    const right = left + 1
    const best = [left, right].reduce(
      (champion, candidate) =>
        candidate < heap.length && precedes(heap[candidate] as Node, heap[champion] as Node, width)
          ? candidate
          : champion,
      parent,
    )
    if (best === parent) break
    const swap = heap[best] as Node
    heap[best] = heap[parent] as Node
    heap[parent] = swap
    parent = best
  }
  return top
}

function* ancestors(node: Node): Generator<Point> {
  for (let current: Node | null = node; current; current = current.parent) yield current.point
}

/**
 * A* over a 4-connected grid with a Manhattan heuristic (admissible and
 * consistent on unit-cost grids, so the returned path is shortest).
 *
 * Returns the cells from `start` to `goal` inclusive, or `null` when no path
 * exists. Ties are broken deterministically, so equal inputs give equal paths.
 */
export const findPath = (options: PathfindingOptions): Point[] | null => {
  const { start, goal, canStep, maxIterations = 100_000, width } = options
  if (!inBounds(options, start) || !inBounds(options, goal)) return null
  if (options.goalReachable && !options.goalReachable(goal)) return null
  if (pointsEqual(start, goal)) return [start]

  const keyOf = (point: Point): number => point.y * width + point.x
  const bestG = new Map<number, number>([[keyOf(start), 0]])
  const closed = new Set<number>()
  const open: Node[] = []
  heapPush(open, { point: start, g: 0, f: manhattanDistance(start, goal), parent: null }, width)

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const current = heapPop(open, width)
    if (!current) return null
    const currentKey = keyOf(current.point)
    if (closed.has(currentKey)) continue // stale duplicate left by lazy deletion
    if (pointsEqual(current.point, goal)) return Array.from(ancestors(current)).reverse()
    closed.add(currentKey)

    for (const direction of DIRECTIONS) {
      const next = stepTile(current.point, direction)
      if (!inBounds(options, next) || closed.has(keyOf(next))) continue
      if (!canStep(current.point, direction)) continue
      const g = current.g + 1
      if (g >= (bestG.get(keyOf(next)) ?? Infinity)) continue
      bestG.set(keyOf(next), g)
      heapPush(
        open,
        { point: next, g, f: g + manhattanDistance(next, goal), parent: current },
        width,
      )
    }
  }
  return null
}
