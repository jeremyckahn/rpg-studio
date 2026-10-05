import { TICKS_PER_SECOND } from './types.ts'

/**
 * Converts variable frame times into whole fixed-length simulation ticks, so the
 * simulation behaves identically at 30, 60 or 144 frames per second.
 */
export interface FixedStepClock {
  /** Feeds `deltaMs` of real time and returns how many ticks to run now. */
  advance: (deltaMs: number) => number
  /** Fraction (0..1) of the way to the next tick, for render interpolation. */
  alpha: () => number
  reset: () => void
}

export const createFixedStepClock = (
  ticksPerSecond: number = TICKS_PER_SECOND,
  /** Bounds catch-up after a stall (a background tab) to avoid a spiral of death. */
  maxTicksPerAdvance = 5,
): FixedStepClock => {
  const tickMs = 1000 / ticksPerSecond
  let accumulated = 0
  return {
    advance: (deltaMs) => {
      accumulated += Math.max(0, deltaMs)
      // The epsilon keeps 144 frames of 1000/144 ms from summing to 59.9999... ticks.
      const due = Math.floor(accumulated / tickMs + 1e-9)
      const ticks = Math.min(due, maxTicksPerAdvance)
      // Drop time we refuse to simulate instead of owing it forever.
      accumulated = due > maxTicksPerAdvance ? 0 : Math.max(0, accumulated - ticks * tickMs)
      return ticks
    },
    alpha: () => accumulated / tickMs,
    reset: () => {
      accumulated = 0
    },
  }
}
