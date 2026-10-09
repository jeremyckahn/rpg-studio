import { readdirSync, readFileSync } from 'node:fs'

/** Seconds of test time per spec file, keyed by the file name without `.e2e.ts`. */
export type SpecTimings = Readonly<Record<string, number>>

interface Shard {
  readonly specs: readonly string[]
  readonly load: number
}

/** Names of the spec files in `directory`, without the `.e2e.ts` ending. */
export const listSpecs = (directory: string): readonly string[] =>
  readdirSync(directory)
    .filter((file) => file.endsWith('.e2e.ts'))
    .map((file) => file.replace(/\.e2e\.ts$/, ''))
    .toSorted()

/** Reads `timings.json`; anything that is not a finite number is ignored. */
export const loadTimings = (path: string): SpecTimings => {
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
  if (typeof parsed !== 'object' || parsed === null) return {}
  return Object.fromEntries(
    Object.entries(parsed).filter(
      (entry): entry is [string, number] =>
        typeof entry[1] === 'number' && Number.isFinite(entry[1]),
    ),
  )
}

/**
 * Splits spec files into `total` shards so that each takes about as long, using each spec's
 * measured time: longest first, each into the shard with the least work so far. A spec with no
 * timing (a new one) counts as the average of the others, so it still lands somewhere sensible.
 * The result is the same on every runner, which is what lets each shard pick its own files.
 */
export const assignSpecs = (
  specs: readonly string[],
  timings: SpecTimings,
  total: number,
): readonly (readonly string[])[] => {
  const known = specs.flatMap((spec) => {
    const seconds = timings[spec]
    return seconds === undefined ? [] : [seconds]
  })
  const fallback =
    known.length > 0 ? known.reduce((sum, seconds) => sum + seconds, 0) / known.length : 1
  const weight = (spec: string): number => timings[spec] ?? fallback

  const empty: readonly Shard[] = Array.from({ length: total }, () => ({ specs: [], load: 0 }))
  const shards = specs
    .toSorted((a, b) => weight(b) - weight(a) || a.localeCompare(b))
    .reduce<readonly Shard[]>((placed, spec) => {
      const target = placed.reduce(
        (best, shard, index) => (shard.load < (placed[best]?.load ?? Infinity) ? index : best),
        0,
      )
      return placed.map((shard, index) =>
        index === target
          ? { specs: [...shard.specs, spec], load: shard.load + weight(spec) }
          : shard,
      )
    }, empty)
  return shards.map((shard) => shard.specs.toSorted())
}

/** Parses `E2E_SHARD`, written `current/total` (for example `3/4`, one-based). */
export const parseShard = (text: string): { current: number; total: number } => {
  const match = /^(\d+)\/(\d+)$/.exec(text)
  const current = Number(match?.[1])
  const total = Number(match?.[2])
  if (!match || current < 1 || current > total) {
    throw new Error(`E2E_SHARD must look like "3/4" (shard 3 of 4); got "${text}"`)
  }
  return { current, total }
}
