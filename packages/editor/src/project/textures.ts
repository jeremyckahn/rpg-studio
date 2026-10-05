import { type TextureProvider, createAssetTextureProvider } from '@rpgstudio/engine/renderer'

import { connectTextureInvalidation } from '../piskel/textureInvalidation.ts'
import { type AssetStore } from './assetStore.ts'

const mimeFor = (path: string): string => {
  const extension = path.slice(path.lastIndexOf('.') + 1).toLowerCase()
  return extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg' : `image/${extension}`
}

/**
 * Textures for the editor's canvases, read straight from the asset store. Any
 * change to an asset resets the texture cache (`Assets.cache.reset()`), which is
 * what makes a saved sprite show up on the map immediately.
 */
export const createEditorTextureProvider = (assets: AssetStore): TextureProvider => {
  const provider = createAssetTextureProvider({
    loadBlob: (path) => {
      const bytes = assets.readBytes(path)
      return bytes
        ? Promise.resolve(new Blob([new Uint8Array(bytes)], { type: mimeFor(path) }))
        : Promise.reject(new Error(`${path} is not in the project`))
    },
  })
  connectTextureInvalidation(assets, provider.invalidate)
  return provider
}
