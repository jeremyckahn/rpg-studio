/* eslint-disable functional/immutable-data -- the server records every request it answers in a list the test reads back */
import { type Server, createServer } from 'node:http'
import { type AddressInfo } from 'node:net'
import { extname } from 'node:path'

const TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
}

export interface ServedGame {
  readonly url: string
  /** Paths of every request the server answered, in order. */
  readonly requests: () => readonly string[]
  readonly close: () => Promise<void>
}

/**
 * Serves an exported game's files over HTTP, the way any static host (itch.io, GitHub Pages)
 * would. The player fetches `game.json` and its data with `fetch`, so `file://` cannot be used.
 */
export const serveFiles = async (
  entries: Readonly<Record<string, Uint8Array>>,
): Promise<ServedGame> => {
  const seen: string[] = []
  const server: Server = createServer((request, response) => {
    const path = decodeURIComponent((request.url ?? '/').split('?')[0] ?? '/')
    seen.push(path)
    const entry = entries[path === '/' ? 'index.html' : path.slice(1)]
    if (!entry) {
      response.writeHead(404, { 'Content-Type': 'text/plain' })
      response.end(`Not found: ${path}`)
      return
    }
    response.writeHead(200, {
      'Content-Type':
        TYPES[extname(path === '/' ? 'index.html' : path)] ?? 'application/octet-stream',
    })
    response.end(Buffer.from(entry))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${port}/`,
    requests: () => seen,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error)
          else resolve()
        })
        server.closeAllConnections()
      }),
  }
}
