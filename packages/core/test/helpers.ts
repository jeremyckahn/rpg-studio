import { vi } from 'vitest'

/** Collects values without mutating an array in test code. */
export const recorder = <T>() => {
  const spy = vi.fn<(value: T) => void>()
  return {
    record: (value: T): void => {
      spy(value)
    },
    get values(): readonly T[] {
      return spy.mock.calls.map(([value]) => value)
    },
  }
}
