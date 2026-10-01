import { describe, expect, it } from 'vitest';
import { HeadlessEngine } from '../src/index.js';
import { SaveStateSchema, type Tilemap } from '@rpgstudio/core';

describe('Save / Load Serialization', () => {
  const createMap = (): Tilemap => ({
    id: 1,
    name: 'Overworld',
    width: 3,
    height: 3,
    tileSize: 32,
    tilesetId: 'tileset-1',
    layers: [
      {
        id: 'layer-1',
        name: 'Ground',
        visible: true,
        opacity: 1,
        data: [1, 1, 1, 1, 1, 1, 1, 1, 1],
      },
    ],
    collision: [0, 0, 0, 0, 0, 0, 0, 0, 0],
    events: [],
  });

  it('performs full state round-trip through Zod schema validation', () => {
    const engine1 = new HeadlessEngine();
    engine1.loadMap(createMap());
    engine1.spawnPlayer('alex', 2, 1, 'up');

    engine1.actors = [
      {
        id: 'alex',
        name: 'Alex',
        classId: 1,
        level: 10,
        maxLevel: 99,
        exp: 4500,
        stats: {
          hp: 250,
          maxHp: 250,
          mp: 60,
          maxMp: 60,
          attack: 35,
          defense: 25,
          mAttack: 15,
          mDefense: 18,
          agility: 22,
          luck: 14,
        },
        equips: { weapon: 'mythril-blade' },
        sprite: { characterSheet: 'Actor1.png', characterIndex: 0 },
      },
    ];
    engine1.switches.set('boss_defeated', true);
    engine1.variables.set('keys_found', 3);
    engine1.inventory = [{ itemId: 'mega-potion', count: 2 }];
    engine1.gold = 1500;
    engine1.playTime = 120;

    // Serialize
    const save = engine1.createSaveState();
    const validation = SaveStateSchema.safeParse(save);
    expect(validation.success).toBe(true);

    // Restore in a fresh engine
    const engine2 = new HeadlessEngine();
    engine2.loadMap(createMap());
    engine2.loadSaveState(save);

    expect(engine2.playerEntity?.position?.x).toBe(2);
    expect(engine2.playerEntity?.position?.y).toBe(1);
    expect(engine2.playerEntity?.movement?.direction).toBe('up');
    expect(engine2.actors).toEqual(engine1.actors);
    expect(engine2.switches.get('boss_defeated')).toBe(true);
    expect(engine2.variables.get('keys_found')).toBe(3);
    expect(engine2.inventory).toEqual(engine1.inventory);
    expect(engine2.gold).toBe(1500);
    expect(engine2.playTime).toBe(120);
  });
});
