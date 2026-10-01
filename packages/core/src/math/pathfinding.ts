import {
  type Point,
  coordsToIndex,
  isWithinBounds,
  manhattanDistance,
} from './grid.js';

export interface PathfindingOptions {
  readonly start: Point;
  readonly goal: Point;
  readonly width: number;
  readonly height: number;
  readonly isWalkable: (x: number, y: number) => boolean;
  readonly allowDiagonal?: boolean;
  readonly maxIterations?: number;
}

interface Node {
  readonly x: number;
  readonly y: number;
  readonly g: number;
  readonly h: number;
  readonly f: number;
  readonly parentIndex: number | null;
}

export const findPath = (options: PathfindingOptions): readonly Point[] => {
  const {
    start,
    goal,
    width,
    height,
    isWalkable,
    allowDiagonal = false,
    maxIterations = 5000,
  } = options;

  if (start.x === goal.x && start.y === goal.y) {
    return [start];
  }

  if (!isWithinBounds(goal.x, goal.y, width, height) || !isWalkable(goal.x, goal.y)) {
    return [];
  }

  if (!isWithinBounds(start.x, start.y, width, height)) {
    return [];
  }

  const openSet = new Map<number, Node>();
  const closedSet = new Set<number>();
  const allNodes = new Map<number, Node>();

  const startIndex = coordsToIndex(start.x, start.y, width);
  const startH = manhattanDistance(start, goal);
  const startNode: Node = {
    x: start.x,
    y: start.y,
    g: 0,
    h: startH,
    f: startH,
    parentIndex: null,
  };

  openSet.set(startIndex, startNode);
  allNodes.set(startIndex, startNode);

  const orthogonalDirections: readonly [number, number][] = [
    [0, -1], // up
    [1, 0],  // right
    [0, 1],  // down
    [-1, 0], // left
  ];

  const diagonalDirections: readonly [number, number][] = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ];

  const directions = allowDiagonal
    ? [...orthogonalDirections, ...diagonalDirections]
    : orthogonalDirections;

  const reconstructPath = (current: Node, nodes: ReadonlyMap<number, Node>): readonly Point[] => {
    const step = (node: Node, acc: readonly Point[]): readonly Point[] => {
      const nextAcc: readonly Point[] = [{ x: node.x, y: node.y }, ...acc];
      if (node.parentIndex === null) {
        return nextAcc;
      }
      const parent = nodes.get(node.parentIndex);
      return parent ? step(parent, nextAcc) : nextAcc;
    };
    return Object.freeze(step(current, []));
  };

  for (const _ of Array.from({ length: maxIterations })) {
    if (openSet.size === 0) {
      break;
    }

    // Find node with lowest f cost (break ties with h)
    const bestEntry = Array.from(openSet.entries()).reduce<readonly [number, Node] | null>(
      (best, entry) => {
        if (!best) {
          return entry;
        }
        const [, node] = entry;
        const [, bestNode] = best;
        if (node.f < bestNode.f || (node.f === bestNode.f && node.h < bestNode.h)) {
          return entry;
        }
        return best;
      },
      null
    );

    if (!bestEntry) {
      break;
    }

    const [bestIndex, current] = bestEntry;

    // Goal reached
    if (current.x === goal.x && current.y === goal.y) {
      return reconstructPath(current, allNodes);
    }

    openSet.delete(bestIndex);
    closedSet.add(bestIndex);

    // Expand neighbors
    for (const [dx, dy] of directions) {
      const nx = current.x + dx;
      const ny = current.y + dy;

      if (!isWithinBounds(nx, ny, width, height)) {
        continue;
      }

      const nIndex = coordsToIndex(nx, ny, width);
      if (closedSet.has(nIndex)) {
        continue;
      }

      if (!isWalkable(nx, ny)) {
        continue;
      }

      // For diagonal movement, ensure we don't cut corners through impassable orthogonal tiles
      if (dx !== 0 && dy !== 0) {
        if (!isWalkable(current.x + dx, current.y) || !isWalkable(current.x, current.y + dy)) {
          continue;
        }
      }

      const moveCost = dx !== 0 && dy !== 0 ? 1.414 : 1;
      const tentativeG = current.g + moveCost;

      const existingNode = openSet.get(nIndex);
      if (!existingNode || tentativeG < existingNode.g) {
        const h = manhattanDistance({ x: nx, y: ny }, goal);
        const neighborNode: Node = {
          x: nx,
          y: ny,
          g: tentativeG,
          h,
          f: tentativeG + h,
          parentIndex: bestIndex,
        };
        openSet.set(nIndex, neighborNode);
        allNodes.set(nIndex, neighborNode);
      }
    }
  }

  return [];
};
