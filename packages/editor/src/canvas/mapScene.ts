import { CollisionFlags, type Point, type Tilemap } from '@rpgstudio/core'
import { CompositeTilemap } from '@pixi/tilemap'
import {
  PIXEL_ART_APPLICATION_OPTIONS,
  configurePixelArtDefaults,
  drawTiles,
  planLayerDraws,
  tilesetColumnCount,
} from '@rpgstudio/engine/renderer'
import { Application, Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js'

import { type MapTool } from '../store/slices/editorUi.ts'
import { type Vec2, centeredPan, clampPan, panForZoom, screenToTile } from './geometry.ts'

export interface SceneState {
  readonly map: Tilemap
  readonly tileset: Texture | undefined
  readonly selectedLayer: number
  readonly dimInactiveLayers: boolean
  readonly showGrid: boolean
  readonly showCollision: boolean
  readonly zoom: number
  readonly tool: MapTool
  readonly selectedTile: number
}

export interface MapScene {
  readonly app: Application
  update: (state: SceneState) => void
  /** Highlights a cell, or clears the highlight with `null`. */
  setHover: (cell: Point | null) => void
  /** Pixel position within the canvas, for converting pointer events. */
  cellAt: (screen: Vec2) => Point
  panBy: (delta: Vec2) => void
  /** Remembers where zooming should be centred (the pointer position). */
  setZoomAnchor: (anchor: Vec2 | null) => void
  centerMap: () => void
  destroy: () => void
}

interface LayerView {
  readonly layer: Tilemap['layers'][number]
  readonly tilemap: CompositeTilemap
  readonly tileset: Texture | undefined
  readonly width: number
}

const GRID_COLOR = 0xffffff
const SOLID_COLOR = 0xff2244
const LEDGE_COLOR = 0xffb020
const EVENT_COLOR = 0x39c5ff
const HOVER_COLOR = 0xffffff
const DIMMED_ALPHA = 0.4

/**
 * The map editor's PixiJS scene. It draws every layer as its own batched
 * tilemap, rebuilding only the layers whose data changed (the reducers keep
 * untouched layers referentially equal), plus collision, event and grid
 * overlays and a hover cursor. Nearest-neighbour sampling and whole-pixel
 * placement keep it crisp at every zoom level.
 */
export const createMapScene = async (container: HTMLElement): Promise<MapScene> => {
  configurePixelArtDefaults()
  const app = new Application()
  await app.init({
    ...PIXEL_ART_APPLICATION_OPTIONS,
    background: '#1b1d23',
    resizeTo: container,
    resolution: window.devicePixelRatio,
    autoDensity: true,
  })
  container.append(app.canvas)

  const world = new Container()
  const backdrop = new Graphics()
  const layersContainer = new Container()
  const collisionGraphics = new Graphics()
  const eventsGraphics = new Graphics()
  const gridGraphics = new Graphics()
  const hoverGraphics = new Graphics()
  const preview = new Sprite()
  preview.alpha = 0.6
  preview.visible = false
  world.addChild(
    backdrop,
    layersContainer,
    collisionGraphics,
    eventsGraphics,
    preview,
    gridGraphics,
    hoverGraphics,
  )
  app.stage.addChild(world)

  let views: readonly LayerView[] = []
  let current: SceneState | null = null
  let zoom = 1
  let pan: Vec2 = { x: 0, y: 0 }
  let zoomAnchor: Vec2 | null = null
  let hover: Point | null = null
  let drawn = {
    map: null as Tilemap | null,
    collision: null as Tilemap['collision'] | null,
    events: null as Tilemap['events'] | null,
    showCollision: false,
    showGrid: false,
    zoom: 0,
  }
  let previewKey = ''
  let centeredFor: number | null = null

  const viewSize = (): { width: number; height: number } => ({
    width: app.screen.width,
    height: app.screen.height,
  })

  const applyTransform = (state: SceneState): void => {
    const mapPixels = {
      width: state.map.width * state.map.tileSize,
      height: state.map.height * state.map.tileSize,
    }
    pan = clampPan(pan, mapPixels, zoom, viewSize())
    world.scale.set(zoom)
    world.position.set(Math.round(pan.x), Math.round(pan.y))
  }

  const drawBackdrop = (map: Tilemap): void => {
    backdrop.clear()
    backdrop
      .rect(0, 0, map.width * map.tileSize, map.height * map.tileSize)
      .fill({ color: 0x000000 })
  }

  const drawGrid = (map: Tilemap): void => {
    gridGraphics.clear()
    const width = map.width * map.tileSize
    const height = map.height * map.tileSize
    Array.from({ length: map.width + 1 }, (_, i) => i * map.tileSize).forEach((x) => {
      gridGraphics.moveTo(x, 0).lineTo(x, height)
    })
    Array.from({ length: map.height + 1 }, (_, i) => i * map.tileSize).forEach((y) => {
      gridGraphics.moveTo(0, y).lineTo(width, y)
    })
    // One screen pixel wide at any zoom.
    gridGraphics.stroke({ width: 1 / zoom, color: GRID_COLOR, alpha: 0.22 })
  }

  const drawCollision = (map: Tilemap): void => {
    collisionGraphics.clear()
    const size = map.tileSize
    const bar = Math.max(2, size / 6)
    map.collision.forEach((flags, index) => {
      if (flags === 0) return
      const x = (index % map.width) * size
      const y = Math.floor(index / map.width) * size
      if (flags & CollisionFlags.SOLID) {
        collisionGraphics.rect(x, y, size, size).fill({ color: SOLID_COLOR, alpha: 0.38 })
        return
      }
      const edges: readonly [number, [number, number, number, number]][] = [
        [CollisionFlags.BLOCK_UP, [x, y, size, bar]],
        [CollisionFlags.BLOCK_DOWN, [x, y + size - bar, size, bar]],
        [CollisionFlags.BLOCK_LEFT, [x, y, bar, size]],
        [CollisionFlags.BLOCK_RIGHT, [x + size - bar, y, bar, size]],
      ]
      edges.forEach(([flag, [rx, ry, rw, rh]]) => {
        if (flags & flag)
          collisionGraphics.rect(rx, ry, rw, rh).fill({ color: LEDGE_COLOR, alpha: 0.85 })
      })
    })
  }

  const drawEvents = (map: Tilemap): void => {
    eventsGraphics.clear()
    const size = map.tileSize
    map.events.forEach((event) => {
      eventsGraphics
        .rect(event.x * size + 1, event.y * size + 1, size - 2, size - 2)
        .fill({ color: EVENT_COLOR, alpha: 0.28 })
        .stroke({ width: Math.max(1, size / 16), color: EVENT_COLOR, alpha: 0.95 })
    })
  }

  const drawHover = (): void => {
    hoverGraphics.clear()
    if (!hover || !current) {
      preview.visible = false
      return
    }
    const { map, tool, selectedTile, tileset } = current
    const size = map.tileSize
    if (hover.x < 0 || hover.y < 0 || hover.x >= map.width || hover.y >= map.height) {
      preview.visible = false
      return
    }
    hoverGraphics
      .rect(hover.x * size, hover.y * size, size, size)
      .stroke({ width: Math.max(1, 1.5 / zoom), color: HOVER_COLOR, alpha: 0.95 })

    if ((tool === 'pencil' || tool === 'fill') && tileset) {
      const columns = tilesetColumnCount(tileset.width, size)
      const key = `${tileset.uid}:${selectedTile}:${size}`
      if (key !== previewKey) {
        previewKey = key
        preview.texture = new Texture({
          source: tileset.source,
          frame: new Rectangle(
            ((selectedTile - 1) % columns) * size,
            Math.floor((selectedTile - 1) / columns) * size,
            size,
            size,
          ),
        })
      }
      preview.position.set(hover.x * size, hover.y * size)
      preview.visible = true
    } else {
      preview.visible = false
    }
  }

  const syncLayers = (state: SceneState): void => {
    const { map, tileset } = state
    const columns = tileset ? tilesetColumnCount(tileset.width, map.tileSize) : 1
    const next = map.layers.map((layer, index): LayerView => {
      const existing = views[index]
      const reusable =
        existing &&
        existing.layer === layer &&
        existing.tileset === tileset &&
        existing.width === map.width
      if (reusable) return existing
      existing?.tilemap.destroy()
      const tilemap = new CompositeTilemap()
      if (tileset) drawTiles(tilemap, tileset, planLayerDraws(map, layer, columns), map.tileSize)
      return { layer, tilemap, tileset, width: map.width }
    })
    views.slice(map.layers.length).forEach((view) => {
      view.tilemap.destroy()
    })
    layersContainer.removeChildren()
    next.forEach((view, index) => {
      view.tilemap.visible = view.layer.visible
      view.tilemap.alpha =
        state.dimInactiveLayers && index !== state.selectedLayer ? DIMMED_ALPHA : 1
      layersContainer.addChild(view.tilemap)
    })
    views = next
  }

  const update: MapScene['update'] = (state) => {
    const mapChanged = current?.map.id !== state.map.id
    current = state

    if (state.zoom !== zoom) {
      const anchor = zoomAnchor ?? { x: app.screen.width / 2, y: app.screen.height / 2 }
      pan = panForZoom(anchor, pan, zoom, state.zoom)
      zoom = state.zoom
    }
    if (mapChanged || centeredFor !== state.map.id) {
      centeredFor = state.map.id
      pan = centeredPan(
        {
          width: state.map.width * state.map.tileSize,
          height: state.map.height * state.map.tileSize,
        },
        zoom,
        viewSize(),
      )
    }

    syncLayers(state)

    const geometryChanged =
      drawn.map?.width !== state.map.width ||
      drawn.map?.height !== state.map.height ||
      drawn.map?.tileSize !== state.map.tileSize
    if (geometryChanged) drawBackdrop(state.map)
    if (geometryChanged || drawn.zoom !== zoom || drawn.showGrid !== state.showGrid) {
      gridGraphics.visible = state.showGrid
      if (state.showGrid) drawGrid(state.map)
    }
    if (
      geometryChanged ||
      drawn.collision !== state.map.collision ||
      drawn.showCollision !== state.showCollision
    ) {
      collisionGraphics.visible = state.showCollision
      if (state.showCollision) drawCollision(state.map)
    }
    if (geometryChanged || drawn.events !== state.map.events) drawEvents(state.map)

    drawn = {
      map: state.map,
      collision: state.map.collision,
      events: state.map.events,
      showCollision: state.showCollision,
      showGrid: state.showGrid,
      zoom,
    }
    applyTransform(state)
    drawHover()
  }

  return {
    app,
    update,
    setHover: (cell) => {
      hover = cell
      drawHover()
    },
    cellAt: (screen) => screenToTile(screen, pan, zoom, current?.map.tileSize ?? 16),
    panBy: (delta) => {
      pan = { x: pan.x + delta.x, y: pan.y + delta.y }
      if (current) applyTransform(current)
    },
    setZoomAnchor: (anchor) => {
      zoomAnchor = anchor
    },
    centerMap: () => {
      if (!current) return
      pan = centeredPan(
        {
          width: current.map.width * current.map.tileSize,
          height: current.map.height * current.map.tileSize,
        },
        zoom,
        viewSize(),
      )
      applyTransform(current)
    },
    destroy: () => {
      app.destroy({ removeView: true }, { children: true })
    },
  }
}
