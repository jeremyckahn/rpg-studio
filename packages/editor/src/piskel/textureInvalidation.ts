import { type Unsubscribe } from '@rpgstudio/core'

import { type AssetStore } from '../project/assetStore.ts'

/**
 * Live hot-reloading: whenever any asset is written, removed or replaced,
 * `invalidate` runs (the editor passes the texture provider's `invalidate`,
 * which calls `Assets.cache.reset()`), so canvases fetch fresh pixels instead
 * of showing stale textures. No refresh of the application is needed.
 */
export const connectTextureInvalidation = (
  assets: AssetStore,
  invalidate: () => void,
): Unsubscribe =>
  assets.subscribe(() => {
    invalidate()
  })
