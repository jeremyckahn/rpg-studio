/* eslint-disable functional/immutable-data -- collecting events raised by browser callbacks needs a mutable list */
import { test as base } from '@playwright/test'

import { type Studio, createStudio } from './studio.ts'

interface Options {
  /** Load the editor before the test body runs. Turn off with `test.use({ openEditor: false })`. */
  openEditor: boolean
}

/** Browser-side problems seen during a test: uncaught exceptions and `console.error` calls. */
export interface BrowserProblems {
  /** Everything reported so far. */
  readonly list: () => readonly string[]
  /** Stop treating messages that match as failures (for tests that provoke an expected error). */
  readonly allow: (pattern: RegExp) => void
}

/**
 * - `studio` is automatic: each test gets a fresh browser context (so a brand-new project) with the
 *   editor already booted. A test that must prepare the page first, for example by stubbing a browser
 *   API with `addInitScript`, opts out with `test.use({ openEditor: false })` and calls `studio.open()`.
 * - `problems` is automatic too and fails any test during which the page threw or logged an error,
 *   so a regression that only shows up in the console cannot slip through a passing test.
 */
export const test = base.extend<Options & { studio: Studio; problems: BrowserProblems }>({
  openEditor: [true, { option: true }],
  problems: [
    async ({ page }, use) => {
      const seen: string[] = []
      let allowed: readonly RegExp[] = []
      page.on('pageerror', (error) => seen.push(`Uncaught: ${error.message}`))
      page.on('console', (message) => {
        if (message.type() === 'error') seen.push(`console.error: ${message.text()}`)
      })
      const unexpected = (): string[] =>
        seen.filter((text) => !allowed.some((pattern) => pattern.test(text)))
      await use({
        list: unexpected,
        allow: (pattern) => {
          allowed = [...allowed, pattern]
        },
      })
      if (unexpected().length > 0) {
        throw new Error(`The browser reported problems:\n${unexpected().join('\n')}`)
      }
    },
    { auto: true },
  ],
  studio: [
    async ({ page, openEditor }, use) => {
      const studio = createStudio(page)
      if (openEditor) await studio.open()
      await use(studio)
    },
    { auto: true },
  ],
})

export { expect } from '@playwright/test'
