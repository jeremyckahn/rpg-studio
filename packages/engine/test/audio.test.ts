import { describe, expect, it } from 'vitest';
import { AudioManager } from '../src/index.js';

describe('AudioManager', () => {
  it('manages volumes for 4 tiers and master', () => {
    const audio = AudioManager.getInstance();

    audio.setVolume('master', 0.5);
    expect(audio.getVolume('master')).toBe(0.5);

    audio.setVolume('bgm', 0.75);
    expect(audio.getVolume('bgm')).toBe(0.75);

    audio.setVolume('bgs', 0.6);
    expect(audio.getVolume('bgs')).toBe(0.6);

    audio.setVolume('me', 0.85);
    expect(audio.getVolume('me')).toBe(0.85);

    audio.setVolume('se', 0.95);
    expect(audio.getVolume('se')).toBe(0.95);
  });

  it('provides unlock handler that works in non-browser environments', () => {
    const audio = AudioManager.getInstance();
    const cleanup = audio.setupUnlockHandler();
    expect(typeof cleanup).toBe('function');
    cleanup();
  });
});
