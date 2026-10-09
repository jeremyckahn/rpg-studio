/* eslint-disable functional/immutable-data -- a reporter collects results as the tests finish, so it keeps a mutable total per spec */
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  type FullResult,
  type Reporter,
  type TestCase,
  type TestResult,
} from '@playwright/test/reporter'

import { loadTimings } from './sharding.ts'

const FILE = resolve(import.meta.dirname, 'timings.json')

/**
 * Records how long each spec file's tests took and writes them to `support/timings.json`, which
 * `sharding.ts` uses to give every CI shard about the same amount of work. Run it with
 * `pnpm --filter @rpgstudio/e2e timings` (the whole suite, two workers like CI). Specs a run did not
 * cover keep their old numbers.
 */
export default class TimingsReporter implements Reporter {
  private readonly seconds = new Map<string, number>()

  onTestEnd(test: TestCase, result: TestResult): void {
    if (result.status !== 'passed') return
    const [, , spec = ''] = test.titlePath()
    const name = spec.replace(/\.e2e\.ts$/, '')
    this.seconds.set(name, (this.seconds.get(name) ?? 0) + result.duration / 1000)
  }

  onEnd(result: FullResult): void {
    // A failed run has no trustworthy durations.
    if (result.status !== 'passed') return
    const previous = loadTimings(FILE)
    const merged = { ...previous, ...Object.fromEntries(this.seconds) }
    const rounded = Object.fromEntries(
      Object.entries(merged)
        .toSorted(([a], [b]) => a.localeCompare(b))
        .map(([name, seconds]) => [name, Math.round(seconds)]),
    )
    writeFileSync(FILE, `${JSON.stringify(rounded, null, 2)}\n`)
  }

  printsToStdio(): boolean {
    return false
  }
}
