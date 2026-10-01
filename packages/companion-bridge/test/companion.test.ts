import { describe, expect, it } from 'vitest';
import { COMPANION_BRIDGE_VERSION } from '../src/index.js';

describe('Companion Bridge Foundation', () => {
  it('exports COMPANION_BRIDGE_VERSION', () => {
    expect(COMPANION_BRIDGE_VERSION).toBe('0.1.0');
  });
});
