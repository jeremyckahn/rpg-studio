/**
 * Seeded, serialisable pseudo-random number generator (mulberry32). Identical
 * seeds produce identical sequences on every platform, which keeps headless
 * simulations and saved games reproducible.
 */
export interface Rng {
  /** Uniform float in `[0, 1)`. */
  next: () => number
  /** Uniform integer in `[0, maxExclusive)`. */
  nextInt: (maxExclusive: number) => number
  /** Uniform integer in `[min, max]`. */
  range: (min: number, max: number) => number
  /** A uniformly chosen element. Throws on an empty array. */
  pick: <T>(items: readonly T[]) => T
  /** Current internal state (uint32); pass to `createRng` to resume. */
  getState: () => number
}

export const createRng = (seed: number): Rng => {
  let state = seed >>> 0

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  const nextInt = (maxExclusive: number): number => {
    if (!Number.isInteger(maxExclusive) || maxExclusive < 1) {
      throw new RangeError(`maxExclusive must be a positive integer, got ${maxExclusive}`)
    }
    return Math.floor(next() * maxExclusive)
  }

  return {
    next,
    nextInt,
    range: (min, max) => min + nextInt(max - min + 1),
    pick: (items) => {
      if (items.length === 0) throw new RangeError('Cannot pick from an empty array')
      return items[nextInt(items.length)] as (typeof items)[number]
    },
    getState: () => state,
  }
}
