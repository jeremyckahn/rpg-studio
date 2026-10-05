import { type Project, createEmptyMap, createStarterProject, ProjectSchema } from '@rpgstudio/core'
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

/** A project with two maps and an event that transfers between them. */
export const sampleProject = (): Project => {
  const starter = createStarterProject('Sample')
  return ProjectSchema.parse({
    ...starter,
    meta: { ...starter.meta, startX: 1, startY: 1 },
    maps: [
      {
        ...createEmptyMap({ id: 1, name: 'Town', width: 6, height: 4 }),
        events: [
          {
            id: 1,
            name: 'Door',
            x: 5,
            y: 3,
            pages: [
              {
                trigger: 'touch',
                solid: false,
                commands: [{ command: 'TransferPlayer', mapId: 2, x: 2, y: 2 }],
              },
            ],
          },
        ],
      },
      createEmptyMap({ id: 2, name: 'Cave', width: 4, height: 4, fill: 2 }),
    ],
  })
}
