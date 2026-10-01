import { coordsToIndex, isWithinBounds, type Point } from '@rpgstudio/core';

export const performFloodFill = (
  data: readonly number[],
  width: number,
  height: number,
  startX: number,
  startY: number,
  replacementTileId: number
): readonly number[] => {
  if (!isWithinBounds(startX, startY, width, height)) {
    return data;
  }

  const startIndex = coordsToIndex(startX, startY, width);
  const targetTileId = data[startIndex];
  if (targetTileId === undefined || targetTileId === replacementTileId) {
    return data;
  }

  const nextData = [...data];
  const queue: Point[] = [{ x: startX, y: startY }];
  const visited = new Set<number>();

  while (queue.length > 0) {
    const pt = queue.pop();
    if (!pt) continue;

    const idx = coordsToIndex(pt.x, pt.y, width);
    if (visited.has(idx)) continue;
    visited.add(idx);

    if (nextData[idx] === targetTileId) {
      nextData[idx] = replacementTileId;

      const neighbors: Point[] = [
        { x: pt.x + 1, y: pt.y },
        { x: pt.x - 1, y: pt.y },
        { x: pt.x, y: pt.y + 1 },
        { x: pt.x, y: pt.y - 1 },
      ];

      for (const n of neighbors) {
        if (isWithinBounds(n.x, n.y, width, height)) {
          const nIdx = coordsToIndex(n.x, n.y, width);
          if (!visited.has(nIdx) && nextData[nIdx] === targetTileId) {
            queue.push(n);
          }
        }
      }
    }
  }

  return Object.freeze(nextData);
};
