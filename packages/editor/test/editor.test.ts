import { describe, expect, it } from 'vitest';
import { EDITOR_VERSION } from '../src/index.js';

describe('Editor Foundation', () => {
  it('exports EDITOR_VERSION', () => {
    expect(EDITOR_VERSION).toBe('0.1.0');
  });
});
