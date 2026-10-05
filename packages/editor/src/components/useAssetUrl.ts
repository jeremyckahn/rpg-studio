import { useEffect, useState } from 'react'

import { type AssetStore } from '../project/assetStore.ts'

const mimeFor = (path: string): string => {
  const extension = path.slice(path.lastIndexOf('.') + 1).toLowerCase()
  return extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg' : `image/${extension}`
}

/**
 * A blob URL for an asset's current bytes, for use in an `<img>`. It is revoked
 * when the asset changes (`version`) or the component goes away.
 */
export const useAssetUrl = (assets: AssetStore, path: string, version: number): string | null => {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let created: string | null = null
    let cancelled = false
    // Deferred so state is set from a callback, not synchronously inside the effect.
    void Promise.resolve().then(() => {
      if (cancelled) return
      const bytes = assets.readBytes(path)
      if (bytes) {
        created = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: mimeFor(path) }))
      }
      setUrl(created)
    })
    return () => {
      cancelled = true
      if (created) URL.revokeObjectURL(created)
    }
  }, [assets, path, version])
  return url
}
