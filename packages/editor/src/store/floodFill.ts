/* eslint-disable functional/immutable-data --
   Flood fill walks the grid with a scratch visited-table and work stack that
   live only for one call and never escape it. */
import { type Point } from '@rpgstudio/core'

export interface GridSize {
  readonly width: number
  readonly height: number
}

/**
 * Row-major indices of the 4-connected region of cells that share the value of
 * the cell at `start`. Returns an empty list if `start` is outside the grid.
 */
export const floodFillCells = (size: GridSize, data: readonly number[], start: Point): number[] => {
  const { width, height } = size
  if (start.x < 0 || start.y < 0 || start.x >= width || start.y >= height) return []
  const startIndex = start.y * width + start.x
  const target = data[startIndex]
  const visited = new Uint8Array(width * height)
  const stack = [startIndex]
  const region: number[] = []
  visited[startIndex] = 1

  while (stack.length > 0) {
    const index = stack.pop() as number
    region.push(index)
    const x = index % width
    const y = Math.floor(index / width)
    const neighbours = [
      x > 0 ? index - 1 : -1,
      x < width - 1 ? index + 1 : -1,
      y > 0 ? index - width : -1,
      y < height - 1 ? index + width : -1,
    ]
    for (const next of neighbours) {
      if (next >= 0 && visited[next] === 0 && data[next] === target) {
        visited[next] = 1
        stack.push(next)
      }
    }
  }
  return region
}
