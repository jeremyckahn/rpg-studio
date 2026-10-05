import { type Tilemap } from '@rpgstudio/core'
import { CompositeTilemap } from '@pixi/tilemap'
import { type Texture } from 'pixi.js'

import { type TileDraw, planTileDraws, tilesetColumnCount } from './tilemapPlan.ts'

/** The slice of `CompositeTilemap` the renderer uses, so it can be tested without a GPU. */
export interface TileSink {
  tile: (
    texture: Texture,
    x: number,
    y: number,
    options: { u: number; v: number; tileWidth: number; tileHeight: number },
  ) => unknown
  clear: () => unknown
}

export const drawTiles = (
  sink: TileSink,
  texture: Texture,
  draws: readonly TileDraw[],
  tileSize: number,
): void => {
  sink.clear()
  for (const { x, y, u, v } of draws) {
    sink.tile(texture, x, y, { u, v, tileWidth: tileSize, tileHeight: tileSize })
  }
}

export interface TilemapLayers {
  /** Drawn beneath characters. */
  readonly below: CompositeTilemap
  /** Drawn over characters (roofs, treetops). */
  readonly above: CompositeTilemap
}

/**
 * Builds the map's tile layers. Every tile shares one tileset texture, so each
 * `CompositeTilemap` batches its whole layer stack into a single vertex buffer
 * and draws it with one WebGL draw call.
 */
export const createTilemapLayers = (map: Tilemap, tileset: Texture): TilemapLayers => {
  const columns = tilesetColumnCount(tileset.width, map.tileSize)
  const build = (above: boolean): CompositeTilemap => {
    const tilemap = new CompositeTilemap()
    drawTiles(tilemap, tileset, planTileDraws(map, columns, above), map.tileSize)
    return tilemap
  }
  return { below: build(false), above: build(true) }
}
