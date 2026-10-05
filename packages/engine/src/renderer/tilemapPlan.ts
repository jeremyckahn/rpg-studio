import { type Tilemap, type TilemapLayer } from '@rpgstudio/core'

/** One tile to draw: where it goes and which cell of the tileset it is. */
export interface TileDraw {
  readonly x: number
  readonly y: number
  readonly u: number
  readonly v: number
}

/** The tiles of a single layer, row-major, skipping empty cells. Tile id `n` selects cell `n - 1`. */
export const planLayerDraws = (
  map: Pick<Tilemap, 'width' | 'tileSize'>,
  layer: TilemapLayer,
  tilesetColumns: number,
): readonly TileDraw[] => {
  const size = map.tileSize
  return layer.data.flatMap((id, cell) =>
    id === 0
      ? []
      : [
          {
            x: (cell % map.width) * size,
            y: Math.floor(cell / map.width) * size,
            u: ((id - 1) % tilesetColumns) * size,
            v: Math.floor((id - 1) / tilesetColumns) * size,
          },
        ],
  )
}

/**
 * Lists the tiles of every visible layer whose `above` flag equals `above`,
 * bottom layer first, row-major within a layer, skipping empty cells.
 */
export const planTileDraws = (
  map: Tilemap,
  tilesetColumns: number,
  above: boolean,
): readonly TileDraw[] =>
  map.layers
    .filter((layer) => layer.visible && layer.above === above)
    .flatMap((layer) => planLayerDraws(map, layer, tilesetColumns))

/** How many whole tiles fit across a tileset image. */
export const tilesetColumnCount = (textureWidth: number, tileSize: number): number =>
  Math.max(1, Math.floor(textureWidth / tileSize))
