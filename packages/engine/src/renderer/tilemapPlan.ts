import { type Tilemap } from '@rpgstudio/core'

/** One tile to draw: where it goes and which cell of the tileset it is. */
export interface TileDraw {
  readonly x: number
  readonly y: number
  readonly u: number
  readonly v: number
}

/**
 * Lists the tiles of every visible layer whose `above` flag equals `above`,
 * bottom layer first, row-major within a layer, skipping empty cells. Tile id
 * `n` selects tileset cell `n - 1`.
 */
export const planTileDraws = (
  map: Tilemap,
  tilesetColumns: number,
  above: boolean,
): readonly TileDraw[] => {
  const size = map.tileSize
  return map.layers
    .filter((layer) => layer.visible && layer.above === above)
    .flatMap((layer) =>
      layer.data.flatMap((id, cell) =>
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
      ),
    )
}

/** How many whole tiles fit across a tileset image. */
export const tilesetColumnCount = (textureWidth: number, tileSize: number): number =>
  Math.max(1, Math.floor(textureWidth / tileSize))
