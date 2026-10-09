import { createHash } from 'node:crypto'
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import { type Reporter, type TestCase, type TestResult } from '@playwright/test/reporter'

/** Where the readable copies go, relative to the package. CI uploads this folder as an artifact. */
const OUTPUT = resolve(import.meta.dirname, '../playwright-videos')

const slug = (text: string): string =>
  text
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)

/**
 * Copies each test's video to `playwright-videos/<spec>/<describe>/<test title>.webm`.
 *
 * Playwright keeps its videos under `test-results/` in folders named with a truncated, hashed form
 * of the test title, which is not something to pick a video out of a download by. The copies are
 * named after the test, and a retry or a second page of the same test gets its own suffix, so
 * nothing overwrites anything.
 */
export default class VideoReporter implements Reporter {
  onTestEnd(test: TestCase, result: TestResult): void {
    const videos = result.attachments.filter(
      (attachment) => attachment.name === 'video' && attachment.path !== undefined,
    )
    videos.forEach((video, index) => {
      const [, , spec = 'spec', ...titles] = test.titlePath()
      // The readable name is lossy (truncated, punctuation stripped), so two titles could map to the
      // same file; a short hash of the full title keeps every video.
      const hash = createHash('sha1').update(titles.join('\0')).digest('hex').slice(0, 6)
      const name =
        `${titles.map(slug).join('--')}.${hash}` +
        (result.retry > 0 ? `.retry${result.retry}` : '') +
        (index > 0 ? `.page${index + 1}` : '')
      const destination = join(OUTPUT, slug(spec.replace(/\.e2e\.ts$/, '')), `${name}.webm`)
      mkdirSync(dirname(destination), { recursive: true })
      copyFileSync(video.path ?? '', destination)
    })
  }

  printsToStdio(): boolean {
    return false
  }
}
