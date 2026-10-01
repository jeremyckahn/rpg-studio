import { describe, expect, it } from 'vitest';
import { performFloodFill } from '../src/index.js';

describe('performFloodFill', () => {
  it('fills contiguous matching tiles with new tileId', () => {
    // 3x3 grid
    // 1 1 2
    // 1 2 2
    // 2 2 2
    const data = [
      1, 1, 2,
      1, 2, 2,
      2, 2, 2,
    ];

    const filled = performFloodFill(data, 3, 3, 0, 0, 9);
    expect(filled).toEqual([
      9, 9, 2,
      9, 2, 2,
      2, 2, 2,
    ]);
  });

  it('does nothing if start tile already has replacement tileId', () => {
    const data = [1, 1, 1, 1];
    const filled = performFloodFill(data, 2, 2, 0, 0, 1);
    expect(filled).toEqual(data);
  });
});
