import { describe, expect, it } from 'vitest';
import { ENGINE_VERSION } from '../src/index.js';

describe('Engine Foundation', () => {
  it('exports ENGINE_VERSION', () => {
    expect(ENGINE_VERSION).toBe('0.1.0');
  });
});
