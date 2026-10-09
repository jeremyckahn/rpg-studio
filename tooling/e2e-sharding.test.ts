import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  assignSpecs,
  listSpecs,
  loadTimings,
  parseShard,
} from '../packages/e2e/support/sharding.ts'

/**
 * The CI shards of the end-to-end suite are balanced by each spec's measured time
 * (`packages/e2e/support/timings.json`). See packages/e2e/AGENTS.md, "Keeping the shards balanced".
 */
const e2e = resolve(import.meta.dirname, '../packages/e2e')
const SHARDS = 4

describe('assignSpecs', () => {
  it('puts the longest specs in different shards and fills the rest around them', () => {
    const shards = assignSpecs(['a', 'b', 'c', 'd', 'e'], { a: 10, b: 9, c: 3, d: 2, e: 1 }, 2)
    expect(shards).toEqual([
      ['a', 'd', 'e'],
      ['b', 'c'],
    ])
  })

  it('gives every spec to exactly one shard, in the same order whatever the input order', () => {
    const timings = { a: 4, b: 4, c: 4, d: 1 }
    const forward = assignSpecs(['a', 'b', 'c', 'd'], timings, 3)
    const backward = assignSpecs(['d', 'c', 'b', 'a'], timings, 3)
    expect(backward).toEqual(forward)
    expect(forward.flat().toSorted()).toEqual(['a', 'b', 'c', 'd'])
  })

  it('counts a spec with no timing as an average one, so a new spec does not pile onto one shard', () => {
    const shards = assignSpecs(['a', 'b', 'new1', 'new2'], { a: 10, b: 10 }, 2)
    expect(shards.map((shard) => shard.length)).toEqual([2, 2])
  })

  it('leaves a shard empty when there are fewer specs than shards', () => {
    expect(assignSpecs(['a'], { a: 5 }, 3)).toEqual([['a'], [], []])
  })
})

describe('parseShard', () => {
  it('reads current/total, one-based', () => {
    expect(parseShard('3/4')).toEqual({ current: 3, total: 4 })
  })

  it.each(['0/4', '5/4', '3', 'x/4', '3/'])('refuses "%s"', (text) => {
    expect(() => parseShard(text)).toThrow(/E2E_SHARD/)
  })
})

describe('the end-to-end shards', () => {
  const specs = listSpecs(resolve(e2e, 'test'))
  const timings = loadTimings(resolve(e2e, 'support/timings.json'))
  const shards = assignSpecs(specs, timings, SHARDS)
  const load = (shard: readonly string[]): number =>
    shard.reduce((sum, spec) => sum + (timings[spec] ?? 0), 0)

  it('run every spec file exactly once', () => {
    expect(shards.flat().toSorted()).toEqual(specs)
  })

  it('are balanced by the recorded times: no shard has more than 15% above the average', () => {
    const loads = shards.map(load)
    const average = loads.reduce((sum, seconds) => sum + seconds, 0) / SHARDS
    expect(Math.max(...loads)).toBeLessThanOrEqual(average * 1.15)
  })

  it('has a timing for every spec file', () => {
    // A spec without one is still placed (as an average one), but the numbers are due a refresh:
    // `pnpm --filter @rpgstudio/e2e timings`, then commit support/timings.json.
    expect(specs.filter((spec) => timings[spec] === undefined)).toEqual([])
  })
})
