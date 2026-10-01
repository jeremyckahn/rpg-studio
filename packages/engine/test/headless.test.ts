import { describe, expect, it } from 'vitest';
import { HeadlessEngine } from '../src/index.js';
import type { Tilemap } from '@rpgstudio/core';

describe('Headless Engine Simulation Harness', () => {
  const createTestMap = (): Tilemap => ({
    id: 1,
    name: 'Test Chamber',
    width: 5,
    height: 5,
    tileSize: 32,
    tilesetId: 'tileset-1',
    layers: [
      {
        id: 'floor',
        name: 'Floor',
        visible: true,
        opacity: 1,
        // 5x5 = 25 tiles
        data: Array.from({ length: 25 }, () => 1),
      },
    ],
    // Solid obstacle at (3, 1) -> index 1 * 5 + 3 = 8
    collision: Array.from({ length: 25 }, (_, idx) => (idx === 8 ? 1 : 0)),
    events: [
      {
        id: 101,
        name: 'NPC Guide',
        x: 2,
        y: 2,
        pages: [
          {
            id: 1,
            trigger: 'action_button',
            conditions: {},
            graphic: {},
            list: [
              { command: 'ShowText', speakerName: 'Guide', text: 'Welcome to RPG Studio!' },
              { command: 'SetSwitch', switchId: 'guide_talked', value: true },
              { command: 'SetVariable', variableId: 'player_tokens', operation: 'set', value: 50 },
            ],
          },
        ],
      },
    ],
  });

  it('simulates player grid movement over N ticks', () => {
    const engine = new HeadlessEngine({ tileSize: 32 });
    engine.loadMap(createTestMap());
    engine.spawnPlayer('hero-1', 1, 1, 'down');

    expect(engine.playerEntity?.position?.x).toBe(1);
    expect(engine.playerEntity?.position?.y).toBe(1);

    // Request move to (2, 1) - moving right
    const moved = engine.movePlayer(1, 0);
    expect(moved).toBe(true);
    expect(engine.playerEntity?.movement?.moving).toBe(true);

    // Run 30 deterministic ticks to complete movement
    engine.simulateTicks(30);

    expect(engine.playerEntity?.position?.x).toBe(2);
    expect(engine.playerEntity?.position?.y).toBe(1);
    expect(engine.playerEntity?.position?.pixelX).toBe(64); // 2 * 32
    expect(engine.playerEntity?.movement?.moving).toBe(false);
  });

  it('blocks player movement when attempting to move into a solid tile', () => {
    const engine = new HeadlessEngine({ tileSize: 32 });
    engine.loadMap(createTestMap());
    // Place player right next to solid obstacle at (3, 1)
    engine.spawnPlayer('hero-1', 2, 1, 'right');

    // Attempt to move right into (3, 1) which has collision = 1
    const moved = engine.movePlayer(1, 0);
    expect(moved).toBe(false);

    engine.simulateTicks(20);

    // Player stays at (2, 1)
    expect(engine.playerEntity?.position?.x).toBe(2);
    expect(engine.playerEntity?.position?.y).toBe(1);
    expect(engine.playerEntity?.movement?.moving).toBe(false);
  });

  it('triggers action_button events and executes event commands over ticks', () => {
    const engine = new HeadlessEngine({ tileSize: 32 });
    engine.loadMap(createTestMap());
    // Place player at (2, 1) facing down towards event at (2, 2)
    engine.spawnPlayer('hero-1', 2, 1, 'down');

    expect(engine.switches.get('guide_talked')).toBeUndefined();
    expect(engine.variables.get('player_tokens')).toBeUndefined();

    // Interact with tile in front (2, 2)
    const triggered = engine.interact();
    expect(triggered).toBe(true);

    // Simulate 5 ticks to execute event queue
    engine.simulateTicks(5);

    expect(engine.dialogueLog).toContain('Welcome to RPG Studio!');
    expect(engine.switches.get('guide_talked')).toBe(true);
    expect(engine.variables.get('player_tokens')).toBe(50);
  });
});
