import { zipSync, strToU8, type Zippable } from 'fflate';
import type { Actor, Item, Skill, Enemy, Tilemap } from '@rpgstudio/core';

export interface ProjectAsset {
  readonly path: string; // e.g. "img/characters/Actor1.png" or "img/characters/Actor1.piskel"
  readonly data: Uint8Array;
}

export interface ProjectExportInput {
  readonly title: string;
  readonly actors: readonly Actor[];
  readonly items: readonly Item[];
  readonly skills: readonly Skill[];
  readonly enemies: readonly Enemy[];
  readonly maps: Readonly<Record<string, Tilemap>>;
  readonly assets?: readonly ProjectAsset[];
  readonly engineScript?: string;
}

export const createStandardGameHtml = (title: string): string => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <title>${title}</title>
  <style>
    body, html { margin: 0; padding: 0; overflow: hidden; background: #000; width: 100%; height: 100%; }
    canvas { display: block; image-rendering: pixelated; image-rendering: crisp-edges; margin: auto; }
  </style>
</head>
<body>
  <div id="game-root"></div>
  <script type="module" src="./js/engine.js"></script>
</body>
</html>`;

export const exportProjectToZip = async (input: ProjectExportInput): Promise<Uint8Array> => {
  const zippable: Zippable = {};

  // 1. Root index.html
  zippable['index.html'] = strToU8(createStandardGameHtml(input.title));

  // 2. Data files in /data/
  zippable['data/actors.json'] = strToU8(JSON.stringify(input.actors, null, 2));
  zippable['data/items.json'] = strToU8(JSON.stringify(input.items, null, 2));
  zippable['data/skills.json'] = strToU8(JSON.stringify(input.skills, null, 2));
  zippable['data/enemies.json'] = strToU8(JSON.stringify(input.enemies, null, 2));

  // 3. Map files in /maps/
  for (const [id, mapData] of Object.entries(input.maps)) {
    zippable[`maps/map_${id}.json`] = strToU8(JSON.stringify(mapData, null, 2));
  }

  // 4. Standalone Engine Distribution in /js/engine.js
  const defaultEngineScript = input.engineScript ?? '// RPG Studio Standalone Engine Runtime\nconsole.log("Game started");\n';
  zippable['js/engine.js'] = strToU8(defaultEngineScript);

  // 5. Assets (strictly excluding .piskel source art files and editor scripts)
  if (input.assets) {
    for (const asset of input.assets) {
      const normalizedPath = asset.path.replace(/^[/\\]+/, '');

      // Stripping raw .piskel source authoring files from export per architectural specification
      if (normalizedPath.endsWith('.piskel') || normalizedPath.includes('.editor.')) {
        continue;
      }

      zippable[normalizedPath] = asset.data;
    }
  }

  // Synchronously package into standard zip binary
  const zipBytes = zipSync(zippable, { level: 6 });
  return zipBytes;
};

export const triggerZipDownload = (zipBytes: Uint8Array, filename = 'game.zip'): void => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  const blob = new Blob([zipBytes], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
