import { type Point } from '@rpgstudio/core'

export interface Vec2 {
  readonly x: number
  readonly y: number
}

/**
 * The map is drawn at `zoom` screen pixels per map pixel and shifted by `pan`
 * screen pixels, so a screen position maps to a tile like this.
 */
export const screenToTile = (screen: Vec2, pan: Vec2, zoom: number, tileSize: number): Point => ({
  x: Math.floor((screen.x - pan.x) / (zoom * tileSize)),
  y: Math.floor((screen.y - pan.y) / (zoom * tileSize)),
})

/** The pan that keeps the map point under `anchor` still while the zoom changes. */
export const panForZoom = (anchor: Vec2, pan: Vec2, fromZoom: number, toZoom: number): Vec2 => ({
  x: anchor.x - ((anchor.x - pan.x) / fromZoom) * toZoom,
  y: anchor.y - ((anchor.y - pan.y) / fromZoom) * toZoom,
})

/**
 * Keeps at least `margin` screen pixels of the map in view so it can never be
 * dragged out of reach. A map smaller than the view may sit anywhere inside it.
 */
export const clampPan = (
  pan: Vec2,
  mapPixels: { width: number; height: number },
  zoom: number,
  view: { width: number; height: number },
  margin = 64,
): Vec2 => {
  const axis = (value: number, size: number, viewSize: number): number =>
    Math.min(Math.max(value, margin - size * zoom), viewSize - margin)
  return {
    x: axis(pan.x, mapPixels.width, view.width),
    y: axis(pan.y, mapPixels.height, view.height),
  }
}

/** Pan that centres the map in the view. */
export const centeredPan = (
  mapPixels: { width: number; height: number },
  zoom: number,
  view: { width: number; height: number },
): Vec2 => ({
  x: Math.round((view.width - mapPixels.width * zoom) / 2),
  y: Math.round((view.height - mapPixels.height * zoom) / 2),
})

/**
 * Every cell on the straight line between two cells (Bresenham), both ends
 * included, so a fast pointer movement paints without gaps.
 */
export const lineCells = (from: Point, to: Point): Point[] => {
  const dx = Math.abs(to.x - from.x)
  const dy = Math.abs(to.y - from.y)
  const stepX = from.x < to.x ? 1 : -1
  const stepY = from.y < to.y ? 1 : -1
  const steps = Math.max(dx, dy)
  if (steps === 0) return [from]
  // A float-free walk: advance along the major axis and round the minor one.
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps
    return {
      x: dx >= dy ? from.x + i * stepX : Math.round(from.x + (to.x - from.x) * t),
      y: dy >= dx ? from.y + i * stepY : Math.round(from.y + (to.y - from.y) * t),
    }
  })
}
