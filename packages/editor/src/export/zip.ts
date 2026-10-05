import { type Zippable, unzip, zip } from 'fflate'

import { type ExportEntries } from './packager.ts'

/** Formats that are already compressed; deflating them again only costs time. */
const STORED_EXTENSIONS: ReadonlySet<string> = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'avif',
  'ogg',
  'mp3',
  'm4a',
])

const extensionOf = (path: string): string => path.slice(path.lastIndexOf('.') + 1).toLowerCase()

/**
 * Packs files into a standard `.zip`. fflate's asynchronous `zip` compresses in a
 * Web Worker (a worker thread in Node), so a large project never freezes the editor.
 */
export const zipEntries = (entries: ExportEntries): Promise<Uint8Array> => {
  const input: Zippable = Object.fromEntries(
    Object.entries(entries).map(([path, bytes]) => [
      path,
      [bytes, { level: STORED_EXTENSIONS.has(extensionOf(path)) ? 0 : 6 }] as const,
    ]),
  )
  return new Promise((resolve, reject) => {
    zip(input, (error, data) => {
      if (error) reject(error)
      else resolve(data)
    })
  })
}

/** Largest total size an archive may expand to, as protection against zip bombs. */
export const MAX_UNZIPPED_BYTES = 512 * 1024 * 1024

export class ArchiveError extends Error {
  override readonly name = 'ArchiveError'
}

const isSafeEntry = (path: string): boolean =>
  path !== '' &&
  !path.startsWith('/') &&
  !path.includes('\\') &&
  !/^[a-zA-Z]:/.test(path) &&
  path.split('/').every((segment) => segment !== '..' && segment !== '.')

/**
 * Unpacks a `.zip`, skipping directory entries. Throws `ArchiveError` for entries
 * that would escape the project folder or archives that expand beyond
 * `MAX_UNZIPPED_BYTES`.
 */
export const unzipEntries = (archive: Uint8Array): Promise<Record<string, Uint8Array>> => {
  let total = 0
  return new Promise((resolve, reject) => {
    unzip(
      archive,
      {
        filter: (file) => {
          if (file.name.endsWith('/')) return false
          if (!isSafeEntry(file.name)) {
            throw new ArchiveError(`The archive contains an unsafe path: ${file.name}`)
          }
          total += file.originalSize
          if (total > MAX_UNZIPPED_BYTES) {
            throw new ArchiveError('The archive expands to more data than is allowed')
          }
          return true
        },
      },
      (error, files) => {
        if (error) reject(error instanceof Error ? error : new ArchiveError(String(error)))
        else resolve(files)
      },
    )
  })
}
