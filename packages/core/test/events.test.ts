import { describe, expect, it, vi } from 'vitest';
import { EventBus, type CoreEvents } from '../src/index.js';

describe('EventBus Pub/Sub', () => {
  it('allows subscription and emits typed payloads', () => {
    const bus = new EventBus<CoreEvents>();
    const listener = vi.fn();

    const unsubscribe = bus.on('map:loaded', listener);
    expect(bus.listenerCount('map:loaded')).toBe(1);

    bus.emit('map:loaded', { mapId: 'starter-village' });
    expect(listener).toHaveBeenCalledWith({ mapId: 'starter-village' });

    unsubscribe();
    expect(bus.listenerCount('map:loaded')).toBe(0);

    bus.emit('map:loaded', { mapId: 'dungeon-1' });
    expect(listener).toHaveBeenCalledOnce();
  });

  it('supports once() one-time event listeners', () => {
    const bus = new EventBus<CoreEvents>();
    const listener = vi.fn();

    bus.once('dialogue:show', listener);
    expect(bus.listenerCount('dialogue:show')).toBe(1);

    bus.emit('dialogue:show', { text: 'Hello, traveler!' });
    expect(listener).toHaveBeenCalledWith({ text: 'Hello, traveler!' });
    expect(bus.listenerCount('dialogue:show')).toBe(0);

    bus.emit('dialogue:show', { text: 'Second message' });
    expect(listener).toHaveBeenCalledOnce();
  });

  it('handles clearing specific or all listeners', () => {
    const bus = new EventBus<CoreEvents>();
    const fn1 = vi.fn();
    const fn2 = vi.fn();

    bus.on('audio:playSE', fn1);
    bus.on('audio:playBGM', fn2);

    expect(bus.listenerCount('audio:playSE')).toBe(1);
    expect(bus.listenerCount('audio:playBGM')).toBe(1);

    bus.clear('audio:playSE');
    expect(bus.listenerCount('audio:playSE')).toBe(0);
    expect(bus.listenerCount('audio:playBGM')).toBe(1);

    bus.clear();
    expect(bus.listenerCount('audio:playBGM')).toBe(0);
  });
});
