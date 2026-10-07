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
    options: { u: number; v: number; tileWidth: number; tileHeight: number; alpha?: number },
  ) => unknown
  clear: () => unknown
}

/**
 * Submits tiles to a tilemap. `alpha` is applied to every tile individually: `@pixi/tilemap`'s
 * shader multiplies only by each tile's own alpha, so setting `alpha` on the tilemap object
 * (which the shader never reads) would change nothing on screen.
 */
export const drawTiles = (
  sink: TileSink,
  texture: Texture,
  draws: readonly TileDraw[],
  tileSize: number,
  alpha = 1,
): void => {
  sink.clear()
  for (const { x, y, u, v } of draws) {
    sink.tile(texture, x, y, {
      u,
      v,
      tileWidth: tileSize,
      tileHeight: tileSize,
      ...(alpha === 1 ? {} : { alpha }),
    })
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
