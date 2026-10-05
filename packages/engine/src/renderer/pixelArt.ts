import { type ApplicationOptions, type TextureSource, TextureStyle } from 'pixi.js'

/**
 * Pixel art must never be smoothed. PixiJS 8 spells `SCALE_MODES.NEAREST` as the
 * string `'nearest'`.
 */
export const PIXEL_ART_SCALE_MODE = 'nearest' as const

/** Application options that keep edges razor sharp on every display. */
export const PIXEL_ART_APPLICATION_OPTIONS = {
  antialias: false,
  roundPixels: true,
  background: '#000000',
} as const satisfies Partial<ApplicationOptions>

/** Makes every texture created from now on use nearest-neighbour sampling. */
export const configurePixelArtDefaults = (): void => {
  TextureStyle.defaultOptions.scaleMode = PIXEL_ART_SCALE_MODE
}

/** Forces nearest-neighbour sampling on an already created texture source. */
export const applyPixelArt = (source: TextureSource): void => {
  source.scaleMode = PIXEL_ART_SCALE_MODE
}
