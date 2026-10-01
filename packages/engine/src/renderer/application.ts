import * as PIXI from 'pixi.js';

export interface RendererOptions {
  width?: number;
  height?: number;
  backgroundColor?: number;
  view?: HTMLCanvasElement;
}

export const createPixiApplication = (options: RendererOptions = {}): PIXI.Application => {
  // Enforce pixel-perfect nearest-neighbor scaling across all textures
  if (PIXI.BaseTexture && PIXI.BaseTexture.defaultOptions) {
    PIXI.BaseTexture.defaultOptions.scaleMode = PIXI.SCALE_MODES.NEAREST;
  }
  if (PIXI.settings) {
    PIXI.settings.SCALE_MODE = PIXI.SCALE_MODES.NEAREST;
    PIXI.settings.ROUND_PIXELS = true;
  }

  const app = new PIXI.Application({
    width: options.width ?? 800,
    height: options.height ?? 600,
    backgroundColor: options.backgroundColor ?? 0x000000,
    view: options.view,
    antialias: false,
    autoDensity: true,
    resolution: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
  });

  return app;
};
