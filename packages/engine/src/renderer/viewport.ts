export interface Size {
  readonly width: number
  readonly height: number
}

export interface Vec2 {
  readonly x: number
  readonly y: number
}

/**
 * The largest whole-number zoom at which `design` fits inside `viewport`
 * (never below 1). Whole numbers keep every source pixel the same size on screen.
 */
export const integerScale = (viewport: Size, design: Size): number =>
  Math.max(1, Math.floor(Math.min(viewport.width / design.width, viewport.height / design.height)))

/** Top-left offset that centres a `design`-sized view, zoomed by `scale`, in `viewport`. */
export const letterboxOffset = (viewport: Size, design: Size, scale: number): Vec2 => ({
  x: Math.floor((viewport.width - design.width * scale) / 2),
  y: Math.floor((viewport.height - design.height * scale) / 2),
})

/**
 * Top-left of the camera in world pixels: centred on `focus`, clamped inside the
 * map, and centred on the map along any axis where the map is smaller than the
 * view. Rounded so sprites never land on half pixels.
 */
export const computeCamera = (focus: Vec2, world: Size, view: Size): Vec2 => {
  const axis = (focusAt: number, worldSize: number, viewSize: number): number =>
    worldSize <= viewSize
      ? Math.round((worldSize - viewSize) / 2)
      : Math.round(Math.min(Math.max(focusAt - viewSize / 2, 0), worldSize - viewSize))
  return {
    x: axis(focus.x, world.width, view.width),
    y: axis(focus.y, world.height, view.height),
  }
}
