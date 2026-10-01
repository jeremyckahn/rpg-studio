import * as PIXI from 'pixi.js';
import { CompositeTilemap } from '@pixi/tilemap';
import type { Tilemap } from '@rpgstudio/core';

export interface TilemapRenderOptions {
  tileSize?: number;
  tilesetCols?: number;
}

export const buildTilemapMesh = (
  tilemapData: Tilemap,
  tilesetTexture: PIXI.Texture,
  options: TilemapRenderOptions = {}
): CompositeTilemap => {
  const tileSize = options.tileSize ?? tilemapData.tileSize ?? 32;
  const tilesetCols = options.tilesetCols ?? (Math.floor(tilesetTexture.width / tileSize) || 8);

  const tilemapMesh = new CompositeTilemap();

  for (const layer of tilemapData.layers) {
    if (!layer.visible) {
      continue;
    }

    for (let y = 0; y < tilemapData.height; y++) {
      for (let x = 0; x < tilemapData.width; x++) {
        const index = y * tilemapData.width + x;
        const tileId = layer.data[index];

        // 0 or negative represents empty / transparent tile
        if (tileId === undefined || tileId <= 0) {
          continue;
        }

        // Calculate tile uv from tileId (1-indexed)
        const idZero = tileId - 1;
        const sourceCol = idZero % tilesetCols;
        const sourceRow = Math.floor(idZero / tilesetCols);

        const u = sourceCol * tileSize;
        const v = sourceRow * tileSize;

        tilemapMesh.tile(
          tilesetTexture,
          x * tileSize,
          y * tileSize,
          {
            u,
            v,
            tileWidth: tileSize,
            tileHeight: tileSize,
            alpha: layer.opacity,
          }
        );
      }
    }
  }

  return tilemapMesh;
};
