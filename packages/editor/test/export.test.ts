import { describe, expect, it } from 'vitest';
import { exportProjectToZip } from '../src/index.js';
import { unzipSync, strFromU8, strToU8 } from 'fflate';

describe('Client-Side Export Pipeline (fflate)', () => {
  it('packages project in-memory into zip while stripping .piskel source art files and editor scripts', async () => {
    const projectInput = {
      title: 'Kingdom Adventure',
      actors: [
        {
          id: 'alex',
          name: 'Alex',
          classId: 1,
          level: 1,
          maxLevel: 99,
          exp: 0,
          stats: {
            hp: 100,
            maxHp: 100,
            mp: 20,
            maxMp: 20,
            attack: 15,
            defense: 10,
            mAttack: 8,
            mDefense: 8,
            agility: 12,
            luck: 10,
          },
          equips: {},
          sprite: { characterSheet: 'Actor1.png', characterIndex: 0 },
        },
      ],
      items: [
        {
          id: 'potion-1',
          name: 'Potion',
          description: 'Restores HP',
          iconIndex: 1,
          itemType: 'consumable' as const,
          price: 50,
          consumable: true,
          effects: [],
        },
      ],
      skills: [],
      enemies: [],
      maps: {
        '1': {
          id: 1,
          name: 'Town',
          width: 2,
          height: 2,
          tileSize: 32,
          tilesetId: 'tileset-1',
          layers: [
            {
              id: 'ground',
              name: 'Ground',
              visible: true,
              opacity: 1,
              data: [1, 1, 1, 1],
            },
          ],
          collision: [0, 0, 0, 0],
          events: [],
        },
      },
      assets: [
        {
          path: 'img/characters/Actor1.png',
          data: strToU8('PNG_IMAGE_BYTES'),
        },
        {
          // Raw Piskel authoring file - MUST be stripped
          path: 'img/characters/Actor1.piskel',
          data: strToU8('{"piskelVersion":1,"frames":[]}'),
        },
        {
          // Editor-only script - MUST be stripped
          path: 'plugins/myplugin.editor.ts',
          data: strToU8('// editor code'),
        },
      ],
    };

    const zipBytes = await exportProjectToZip(projectInput);
    expect(zipBytes).toBeInstanceOf(Uint8Array);
    expect(zipBytes.length).toBeGreaterThan(0);

    // Unzip in-memory to verify contents
    const unzipped = unzipSync(zipBytes);

    // Verify index.html exists
    expect(unzipped['index.html']).toBeDefined();
    const indexHtml = strFromU8(unzipped['index.html']!);
    expect(indexHtml).toContain('<title>Kingdom Adventure</title>');

    // Verify data files exist
    expect(unzipped['data/actors.json']).toBeDefined();
    const actorsJson = JSON.parse(strFromU8(unzipped['data/actors.json']!));
    expect(actorsJson[0].name).toBe('Alex');

    // Verify map file exists
    expect(unzipped['maps/map_1.json']).toBeDefined();

    // Verify engine script exists
    expect(unzipped['js/engine.js']).toBeDefined();

    // Verify runtime PNG graphic was included
    expect(unzipped['img/characters/Actor1.png']).toBeDefined();

    // CRITICAL: verify .piskel source file was omitted
    expect(unzipped['img/characters/Actor1.piskel']).toBeUndefined();

    // CRITICAL: verify editor script was omitted
    expect(unzipped['plugins/myplugin.editor.ts']).toBeUndefined();
  });
});
