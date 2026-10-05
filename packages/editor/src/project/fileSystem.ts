/**
 * A project on disk, seen as a flat set of files addressed by project-relative
 * paths. The browser implementation uses the File System Access API; tests use
 * the in-memory one.
 */
export interface ProjectFileSystem {
  /** Folder name, shown in the UI. */
  readonly name: string
  /** Every file below the root, as forward-slash paths. */
  list: () => Promise<readonly string[]>
  readFile: (path: string) => Promise<Uint8Array>
  writeFile: (path: string, data: Uint8Array | string) => Promise<void>
  /** Removes a file; missing files are ignored. */
  deleteFile: (path: string) => Promise<void>
}

const encoder = new TextEncoder()

const toBytes = (data: Uint8Array | string): Uint8Array =>
  typeof data === 'string' ? encoder.encode(data) : data

export interface MemoryFileSystem extends ProjectFileSystem {
  /** Current contents, for assertions. */
  snapshot: () => Readonly<Record<string, Uint8Array>>
}

export const createMemoryFileSystem = (
  initial: Readonly<Record<string, Uint8Array | string>> = {},
  name = 'memory',
): MemoryFileSystem => {
  let files: ReadonlyMap<string, Uint8Array> = new Map(
    Object.entries(initial).map(([path, data]) => [path, toBytes(data)]),
  )
  return {
    name,
    list: () => Promise.resolve([...files.keys()].toSorted()),
    readFile: (path) => {
      const bytes = files.get(path)
      return bytes === undefined
        ? Promise.reject(new Error(`No such file: ${path}`))
        : Promise.resolve(bytes)
    },
    writeFile: (path, data) => {
      files = new Map(files).set(path, toBytes(data))
      return Promise.resolve()
    },
    deleteFile: (path) => {
      files = new Map([...files].filter(([candidate]) => candidate !== path))
      return Promise.resolve()
    },
    snapshot: () => Object.fromEntries(files),
  }
}

/** Folders never worth listing. */
const SKIPPED_DIRECTORIES: ReadonlySet<string> = new Set(['node_modules', '.git'])

const listDirectory = async (
  directory: FileSystemDirectoryHandle,
  prefix: string,
): Promise<string[]> => {
  let entries: readonly FileSystemHandle[] = []
  for await (const entry of directory.values()) entries = [...entries, entry]
  const found = await Promise.all(
    entries.map(async (entry): Promise<string[]> => {
      if (entry.kind === 'file') return [`${prefix}${entry.name}`]
      if (SKIPPED_DIRECTORIES.has(entry.name) || entry.name.startsWith('.')) return []
      return listDirectory(entry as FileSystemDirectoryHandle, `${prefix}${entry.name}/`)
    }),
  )
  return found.flat()
}

const directoryFor = async (
  root: FileSystemDirectoryHandle,
  segments: readonly string[],
  create: boolean,
): Promise<FileSystemDirectoryHandle> => {
  let current = root
  for (const segment of segments) {
    current = await current.getDirectoryHandle(segment, { create })
  }
  return current
}

/** Wraps a directory the user granted access to through `showDirectoryPicker()`. */
export const createDirectoryHandleFileSystem = (
  root: FileSystemDirectoryHandle,
): ProjectFileSystem => {
  const split = (path: string): { directories: string[]; file: string } => {
    const segments = path.split('/')
    return { directories: segments.slice(0, -1), file: segments.at(-1) ?? path }
  }
  return {
    name: root.name,
    list: async () => (await listDirectory(root, '')).toSorted(),
    readFile: async (path) => {
      const { directories, file } = split(path)
      const handle = await (await directoryFor(root, directories, false)).getFileHandle(file)
      return new Uint8Array(await (await handle.getFile()).arrayBuffer())
    },
    writeFile: async (path, data) => {
      const { directories, file } = split(path)
      const handle = await (
        await directoryFor(root, directories, true)
      ).getFileHandle(file, {
        create: true,
      })
      const writable = await handle.createWritable()
      try {
        // Copy into a plain ArrayBuffer-backed view: the stream rejects shared buffers.
        await writable.write(new Uint8Array(toBytes(data)))
      } finally {
        await writable.close()
      }
    },
    deleteFile: async (path) => {
      const { directories, file } = split(path)
      try {
        await (await directoryFor(root, directories, false)).removeEntry(file)
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error
      }
    },
  }
}

declare global {
  interface Window {
    /** Chromium's File System Access API. Undefined in browsers without it. */
    showDirectoryPicker?: (options?: {
      mode?: 'read' | 'readwrite'
    }) => Promise<FileSystemDirectoryHandle>
  }
}

export const supportsDirectoryPicker = (): boolean =>
  typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function'
