const AUDIO_TYPES: Readonly<Record<string, string>> = {
  ogg: 'audio/ogg',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
}

const typeOf = (path: string): string =>
  AUDIO_TYPES[path.slice(path.lastIndexOf('.') + 1).toLowerCase()] ?? 'application/octet-stream'

export interface AssetUrls {
  /** A URL the browser can load the asset from, or the path itself if there is no such asset. */
  urlFor: (path: string) => string
  /** Revokes every URL handed out. */
  dispose: () => void
}

interface Minted {
  readonly bytes: Uint8Array
  readonly url: string
}

/**
 * Audio is played from URLs, and the editor's files live in memory, so each is turned into a
 * blob URL on demand. A URL is reused while the file is unchanged and replaced when it is
 * written again, and the old one is revoked, so editing a sound does not leak.
 */
export const createAssetUrls = (
  read: (path: string) => Uint8Array | undefined,
  api: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'> = URL,
): AssetUrls => {
  let minted: ReadonlyMap<string, Minted> = new Map()
  return {
    urlFor: (path) => {
      const bytes = read(path)
      if (!bytes) return path
      const existing = minted.get(path)
      if (existing?.bytes === bytes) return existing.url
      if (existing) api.revokeObjectURL(existing.url)
      const url = api.createObjectURL(new Blob([new Uint8Array(bytes)], { type: typeOf(path) }))
      minted = new Map(minted).set(path, { bytes, url })
      return url
    },
    dispose: () => {
      minted.forEach(({ url }) => {
        api.revokeObjectURL(url)
      })
      minted = new Map()
    },
  }
}
