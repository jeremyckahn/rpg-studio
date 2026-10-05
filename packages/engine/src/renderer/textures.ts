import { Assets, type Texture } from 'pixi.js'

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

export interface AssetTextureProviderOptions {
  /** Maps a project path to a fetchable URL (a relative URL, or a blob URL in the editor). */
  readonly urlFor: (path: string) => string
}

export const createAssetTextureProvider = ({
  urlFor,
}: AssetTextureProviderOptions): TextureProvider => {
  let loaded: ReadonlyMap<string, Texture> = new Map()
  let generation = 0

  return {
    load: async (path) => {
      const cached = loaded.get(path)
      if (cached) return cached
      const startedIn = generation
      const texture = await Assets.load<Texture>({
        alias: `${generation}:${path}`,
        src: urlFor(path),
        parser: 'texture',
        data: { scaleMode: PIXEL_ART_SCALE_MODE },
      })
      // An invalidation during the fetch makes this result stale; do not cache it.
      if (startedIn === generation) loaded = new Map(loaded).set(path, texture)
      return texture
    },
    get: (path) => loaded.get(path),
    invalidate: () => {
      generation += 1
      loaded = new Map()
      Assets.cache.reset()
    },
  }
}
