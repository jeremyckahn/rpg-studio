import { type Tilemap } from '@rpgstudio/core'
import { Application, Container } from 'pixi.js'

import { type Game } from '../game/game.ts'
import { PIXEL_ART_APPLICATION_OPTIONS, configurePixelArtDefaults } from './pixelArt.ts'
import { createCharacterLayer } from './sprites.ts'
import { type TextureProvider } from './textures.ts'
import { type TilemapLayers, createTilemapLayers } from './tilemap.ts'
import { visualTile } from './characters.ts'
import { computeCamera, integerScale, letterboxOffset } from './viewport.ts'

export interface GameRendererOptions {
  readonly canvas: HTMLCanvasElement
  readonly game: Game
  readonly textures: TextureProvider
  /** How much of the map is visible, in tiles, before integer scaling. */
  readonly viewTiles?: { readonly width: number; readonly height: number }
  /** Element whose size the canvas follows. Defaults to the window. */
  readonly resizeTo?: HTMLElement | Window
}

export interface GameRenderer {
  readonly app: Application
  /** Updates tiles, sprites and camera to match the game. Call once per frame. */
  render: () => void
  /** Recomputes the integer scale after the container changed size. */
  resize: () => void
  /** Rebuilds the tile layers, e.g. after `TextureProvider.invalidate()` hot-reloaded a tileset. */
  reload: () => void
  /**
   * Draws a different game on the same canvas, e.g. after the project was edited. The old
   * picture stays up until the new map's tiles are ready, so a live reload does not flicker.
   */
  setGame: (next: Game) => void
  /**
   * Resolves once the map's tiles and the sprite sheets requested so far are loaded. Call
   * `render()`, await this, then `render()` again to be sure a frame is complete, which a
   * paused game needs because nothing else will draw it later.
   */
  settled: () => Promise<void>
  destroy: () => void
}

const DEFAULT_VIEW_TILES = { width: 20, height: 15 } as const

/**
 * PixiJS renderer for a running game. The scene is pixel-perfect: nearest
 * neighbour textures, no antialiasing, rounded sprite positions, and a view
 * scaled by a whole number and centred in the canvas.
 */
export const createGameRenderer = async (options: GameRendererOptions): Promise<GameRenderer> => {
  const { canvas, textures, viewTiles = DEFAULT_VIEW_TILES } = options
  // Replaceable: `setGame` points the renderer at a rebuilt game without a new canvas.
  let game = options.game
  configurePixelArtDefaults()

  const app = new Application()
  await app.init({
    canvas,
    ...PIXEL_ART_APPLICATION_OPTIONS,
    resizeTo: options.resizeTo ?? window,
    resolution: window.devicePixelRatio,
    autoDensity: true,
  })

  const view = new Container()
  const world = new Container()
  let characters = createCharacterLayer(game, textures)
  view.addChild(world)
  app.stage.addChild(view)

  let mapId: number | null = null
  let layers: TilemapLayers | null = null
  let loadToken = 0
  let loading: Promise<void> = Promise.resolve()

  const showMap = (map: Tilemap): void => {
    const token = (loadToken += 1)
    loading = textures.load(map.tileset).then((tileset) => {
      if (token !== loadToken) return // a newer map was requested meanwhile
      const next = createTilemapLayers(map, tileset)
      world.removeChildren()
      layers?.below.destroy()
      layers?.above.destroy()
      layers = next
      world.addChild(next.below, characters.container, next.above)
    })
  }

  const layout = (): void => {
    const { tileSize } = game.state.map
    const design = { width: viewTiles.width * tileSize, height: viewTiles.height * tileSize }
    const resolution = app.renderer.resolution
    const physical = {
      width: app.screen.width * resolution,
      height: app.screen.height * resolution,
    }
    const scale = integerScale(physical, design)
    const offset = letterboxOffset(physical, design, scale)
    view.scale.set(scale / resolution)
    view.position.set(offset.x / resolution, offset.y / resolution)

    const map = game.state.map
    const at = visualTile(game.state.player) ?? { x: 0, y: 0 }
    const camera = computeCamera(
      { x: at.x * tileSize + tileSize / 2, y: at.y * tileSize + tileSize / 2 },
      { width: map.width * tileSize, height: map.height * tileSize },
      design,
    )
    world.position.set(-camera.x, -camera.y)
  }

  const render = (): void => {
    const map = game.state.map
    if (map.id !== mapId) {
      mapId = map.id
      showMap(map)
    }
    characters.sync()
    layout()
  }

  return {
    app,
    render,
    resize: layout,
    reload: () => {
      mapId = null
    },
    settled: async () => {
      await Promise.allSettled([loading, characters.settled()])
    },
    setGame: (next) => {
      loadToken += 1 // a map still loading for the old game must not be drawn
      game = next
      // Sprites are keyed by entity, and the new game has new entities.
      if (layers) world.removeChild(characters.container)
      characters.destroy()
      characters = createCharacterLayer(game, textures)
      if (layers) world.addChildAt(characters.container, 1)
      mapId = null // rebuild the tiles even when the map id is unchanged
    },
    destroy: () => {
      loadToken += 1
      characters.destroy()
      app.destroy(false, { children: true })
    },
  }
}
