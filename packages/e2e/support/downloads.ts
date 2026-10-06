import { readFile } from 'node:fs/promises'

import { type Page } from '@playwright/test'
import { strToU8, unzipSync, zipSync } from 'fflate'

export interface DownloadedZip {
  readonly filename: string
  readonly entries: Readonly<Record<string, Uint8Array>>
  /** The file's text, for entries that are text. */
  readonly text: (path: string) => string
}

const decoder = new TextDecoder()

/** Runs `trigger` (a click that starts a download) and unpacks the `.zip` the browser saved. */
export const downloadZip = async (
  page: Page,
  trigger: () => Promise<unknown>,
): Promise<DownloadedZip> => {
  const pending = page.waitForEvent('download')
  await trigger()
  const download = await pending
  const path = await download.path()
  const entries = unzipSync(new Uint8Array(await readFile(path)))
  return {
    filename: download.suggestedFilename(),
    entries,
    text: (entry) => {
      const bytes = entries[entry]
      if (!bytes)
        throw new Error(`The archive has no ${entry}. It holds: ${Object.keys(entries).join(', ')}`)
      return decoder.decode(bytes)
    },
  }
}

/** Builds a `.zip` from text and binary files, for import tests. */
export const makeZip = (files: Readonly<Record<string, string | Uint8Array>>): Buffer =>
  Buffer.from(
    zipSync(
      Object.fromEntries(
        Object.entries(files).map(([path, data]) => [
          path,
          typeof data === 'string' ? strToU8(data) : data,
        ]),
      ),
    ),
  )
