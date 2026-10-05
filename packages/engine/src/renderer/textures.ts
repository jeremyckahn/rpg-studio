import { Assets, ImageSource, Texture } from 'pixi.js'

import { PIXEL_ART_SCALE_MODE } from './pixelArt.ts'

/** Resolves project asset paths (like `img/tilesets/basic.png`) to textures. */
export interface TextureProvider {
  /** Loads (once) and returns the texture for a project-relative path. */
  load: (path: string) => Promise<Texture>
  /** The texture if it has already been loaded. */
  get: (path: string) => Texture | undefined
  /**
   * Drops every cached texture so the next `load` fetches fresh pixels. Called
   * after an asset is saved to give live hot-reloading.
   */
  invalidate: () => void
}

/** Turns encoded image data into a texture. Replaceable so tests need no browser. */
export type DecodeTexture = (blob: Blob) => Promise<Texture>

/** Decodes with the browser and samples with nearest-neighbour filtering. */
export const decodeTexture: DecodeTexture = async (blob) => {
  const bitmap = await createImageBitmap(blob, { premultiplyAlpha: 'none' })
  return new Texture({
    source: new ImageSource({ resource: bitmap, scaleMode: PIXEL_ART_SCALE_MODE }),
  })
}

export interface AssetTextureProviderOptions {
  /** Supplies the encoded image for a project path (fetched, or read from the asset store). */
  readonly loadBlob: (path: string) => Promise<Blob>
  readonly decode?: DecodeTexture
}

/**
 * Textures are kept in PixiJS's `Assets.cache` under their project path. Because
 * `invalidate` calls `Assets.cache.reset()`, everything cached through PixiJS is
 * dropped together and reloaded on demand.
 */
export const createAssetTextureProvider = ({
  loadBlob,
  decode = decodeTexture,
}: AssetTextureProviderOptions): TextureProvider => {
  let loaded: ReadonlyMap<string, Texture> = new Map()
  let pending: ReadonlyMap<string, Promise<Texture>> = new Map()
  let generation = 0

  const load = (path: string): Promise<Texture> => {
    const cached = loaded.get(path)
    if (cached) return Promise.resolve(cached)
    const inFlight = pending.get(path)
    if (inFlight) return inFlight

    const startedIn = generation
    const request = loadBlob(path)
      .then(decode)
      .then((texture) => {
        // An invalidation during the fetch made this result stale: hand it to the
        // caller, but do not cache it.
        if (startedIn === generation) {
          loaded = new Map(loaded).set(path, texture)
          Assets.cache.set(path, texture)
        }
        return texture
      })
      .finally(() => {
        if (startedIn === generation) {
          pending = new Map([...pending].filter(([key]) => key !== path))
        }
      })
    pending = new Map(pending).set(path, request)
    return request
  }

  return {
    load,
    get: (path) => loaded.get(path),
    invalidate: () => {
      generation += 1
      loaded = new Map()
      pending = new Map()
      Assets.cache.reset()
    },
  }
}
