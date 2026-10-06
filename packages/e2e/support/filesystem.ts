import { type Page } from '@playwright/test'

/**
 * Chromium's File System Access picker needs a person to choose a folder, which a test cannot do.
 * This replaces `window.showDirectoryPicker` with one that answers from the browser's own private
 * file system (OPFS), so the editor's real save and open code runs against real directory handles.
 *
 * `answers` is consumed one entry per call: a folder name to hand back, or `'cancel'` to reject the
 * way a dismissed picker does. The last entry repeats. Call before `studio.open()`.
 */
export const stubDirectoryPicker = async (
  page: Page,
  answers: readonly string[] = ['my-game'],
): Promise<void> => {
  await page.addInitScript((queue) => {
    let calls = 0
    Reflect.set(window, '__pickerCalls', 0)
    Reflect.set(window, 'showDirectoryPicker', async () => {
      const answer = queue[Math.min(calls, queue.length - 1)] ?? 'my-game'
      calls += 1
      Reflect.set(window, '__pickerCalls', calls)
      if (answer === 'cancel') throw new DOMException('The user aborted a request.', 'AbortError')
      const root = await navigator.storage.getDirectory()
      return root.getDirectoryHandle(answer, { create: true })
    })
  }, answers)
}

/** Makes the page look like a browser without the File System Access API (Firefox, Safari). */
export const removeDirectoryPicker = async (page: Page): Promise<void> => {
  await page.addInitScript(() => {
    Reflect.deleteProperty(window, 'showDirectoryPicker')
  })
}

/** How many times the editor has asked for a folder. */
export const pickerCalls = (page: Page): Promise<number> =>
  page.evaluate(() => Number(Reflect.get(window, '__pickerCalls') ?? 0))

export interface FolderFile {
  readonly size: number
  /** The contents, for `.json` files only. */
  readonly text?: string
}

/** Everything under an OPFS folder, as a flat map keyed by forward-slash path. */
export const readFolder = (page: Page, name: string): Promise<Record<string, FolderFile>> =>
  page.evaluate(async (folder) => {
    const walk = async (
      directory: FileSystemDirectoryHandle,
      prefix: string,
    ): Promise<readonly (readonly [string, FolderFile])[]> => {
      let found: readonly (readonly [string, FolderFile])[] = []
      for await (const entry of directory.values()) {
        if (entry.kind === 'directory') {
          found = [...found, ...(await walk(entry, `${prefix}${entry.name}/`))]
        } else {
          const file = await entry.getFile()
          const described: FolderFile = entry.name.endsWith('.json')
            ? { size: file.size, text: await file.text() }
            : { size: file.size }
          found = [...found, [`${prefix}${entry.name}`, described]]
        }
      }
      return found
    }
    const root = await navigator.storage.getDirectory()
    return Object.fromEntries(await walk(await root.getDirectoryHandle(folder), ''))
  }, name)

/** Creates (or overwrites) files in an OPFS folder, to stand in for a project made elsewhere. */
export const seedFolder = (
  page: Page,
  name: string,
  files: Readonly<Record<string, string>>,
): Promise<void> =>
  page.evaluate(
    async ({ folder, contents }) => {
      const root = await navigator.storage.getDirectory()
      const directory = await root.getDirectoryHandle(folder, { create: true })
      for (const [path, text] of Object.entries(contents)) {
        const segments = path.split('/')
        const file = segments.at(-1) ?? path
        let current = directory
        for (const segment of segments.slice(0, -1)) {
          current = await current.getDirectoryHandle(segment, { create: true })
        }
        const writable = await (
          await current.getFileHandle(file, { create: true })
        ).createWritable()
        await writable.write(text)
        await writable.close()
      }
    },
    { folder: name, contents: files },
  )
