import { describe, expect, it } from 'vitest';
import {
  coordsToIndex,
  findPath,
  indexToCoords,
  intersectsAABB,
  isWithinBounds,
  tileToWorld,
  worldToTile,
} from '../src/index.js';

describe('Grid Math & Pathfinding', () => {
  describe('Coordinate Conversions & Bounds', () => {
    it('converts tile to world coordinates with integer precision', () => {
      expect(tileToWorld(5, 10, 32)).toEqual({ x: 160, y: 320 });
      expect(tileToWorld(0, 0, 16)).toEqual({ x: 0, y: 0 });
    });

    it('converts world coordinates to tile indices', () => {
      expect(worldToTile(165, 330, 32)).toEqual({ x: 5, y: 10 });
      expect(worldToTile(31, 31, 32)).toEqual({ x: 0, y: 0 });
    });

    it('checks 2D bounds correctly', () => {
      expect(isWithinBounds(0, 0, 10, 10)).toBe(true);
      expect(isWithinBounds(9, 9, 10, 10)).toBe(true);
      expect(isWithinBounds(10, 9, 10, 10)).toBe(false);
      expect(isWithinBounds(-1, 0, 10, 10)).toBe(false);
    });

    it('converts between 1D index and 2D coordinates', () => {
      const width = 5;
      const index = coordsToIndex(3, 2, width); // 2 * 5 + 3 = 13
      expect(index).toBe(13);
      expect(indexToCoords(13, width)).toEqual({ x: 3, y: 2 });
    });

    it('detects AABB bounding box intersections', () => {
      const boxA = { x: 0, y: 0, width: 32, height: 32 };
      const boxB = { x: 16, y: 16, width: 32, height: 32 };
      const boxC = { x: 40, y: 40, width: 32, height: 32 };

      expect(intersectsAABB(boxA, boxB)).toBe(true);
      expect(intersectsAABB(boxA, boxC)).toBe(false);
    });
  });

  describe('A* Pathfinding', () => {
    it('finds a direct orthogonal path on an open grid', () => {
      const path = findPath({
        start: { x: 0, y: 0 },
        goal: { x: 3, y: 0 },
        width: 10,
        height: 10,
        isWalkable: () => true,
        allowDiagonal: false,
      });

      expect(path).toEqual([
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 2, y: 0 },
        { x: 3, y: 0 },
      ]);
    });

    it('navigates around an impassable obstacle wall', () => {
      // 5x5 grid with a vertical wall at x = 2, from y = 0 to y = 3
      // Wall leaves a gap at y = 4
      const isWall = (x: number, y: number) => x === 2 && y >= 0 && y <= 3;
      const isWalkable = (x: number, y: number) => !isWall(x, y);

      const path = findPath({
        start: { x: 1, y: 1 },
        goal: { x: 3, y: 1 },
        width: 5,
        height: 5,
        isWalkable,
        allowDiagonal: false,
      });

      expect(path.length).toBeGreaterThan(0);
      expect(path[0]).toEqual({ x: 1, y: 1 });
      expect(path[path.length - 1]).toEqual({ x: 3, y: 1 });

      // Ensure no point on the path steps on the wall
      for (const pt of path) {
        expect(isWall(pt.x, pt.y)).toBe(false);
      }
    });

    it('returns empty array when goal is completely blocked', () => {
      const path = findPath({
        start: { x: 0, y: 0 },
        goal: { x: 2, y: 2 },
        width: 5,
        height: 5,
        isWalkable: (x, y) => !(x === 2 && y === 2), // goal itself is blocked
      });

      expect(path).toEqual([]);
    });

    it('returns single node when start equals goal', () => {
      const point = { x: 4, y: 4 };
      const path = findPath({
        start: point,
        goal: point,
        width: 10,
        height: 10,
        isWalkable: () => true,
      });

      expect(path).toEqual([point]);
    });
  });
});
