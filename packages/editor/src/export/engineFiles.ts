/** The engine files an exported game needs, fetched from the editor's own origin. */
export const ENGINE_FILES = ['player.js'] as const

export type FetchBinary = (url: string) => Promise<Response>

/**
 * Fetches the pre-built engine from `${baseUrl}engine/`. The editor app build
 * copies `@rpgstudio/engine`'s player bundle there.
 */
export const loadEngineFiles = async (
  baseUrl: string,
  fetchFile: FetchBinary = (url) => fetch(url),
): Promise<Record<string, Uint8Array>> => {
  const entries = await Promise.all(
    ENGINE_FILES.map(async (name) => {
      const response = await fetchFile(`${baseUrl}engine/${name}`)
      if (!response.ok) {
        throw new Error(
          `Could not load the game engine (engine/${name}: ${response.status}). Build it with \`pnpm build\` first.`,
        )
      }
      return [name, new Uint8Array(await response.arrayBuffer())] as const
    }),
  )
  return Object.fromEntries(entries)
}

/** Triggers a browser download of `bytes`. */
export const downloadBytes = (
  filename: string,
  bytes: Uint8Array,
  mime = 'application/zip',
): void => {
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: mime }))
  const link = document.createElement('a')
  link.setAttribute('href', url)
  link.setAttribute('download', filename)
  document.body.append(link)
  link.click()
  link.remove()
  // Revoke after the click has been handled.
  setTimeout(() => {
    URL.revokeObjectURL(url)
  }, 10_000)
}

/** A filesystem-friendly name for download files. */
export const slugify = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'game'
