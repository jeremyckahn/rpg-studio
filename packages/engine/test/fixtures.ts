import {
  CollisionFlags,
  type EventCommand,
  type Project,
  ProjectSchema,
  createEmptyMap,
  createStarterProject,
} from '@rpgstudio/core'

export const rows = (...lines: readonly string[]) => lines

/**
 * Builds a map from ASCII art: `#` solid, `>` blocks leaving rightward,
 * anything else is open floor.
 */
export const mapFromAscii = (
  id: number,
  lines: readonly string[],
  extra: Record<string, unknown> = {},
) => {
  const base = createEmptyMap({
    id,
    name: `Map ${id}`,
    width: lines[0]?.length ?? 1,
    height: lines.length,
  })
  return {
    ...base,
    collision: lines.flatMap((line) =>
      [...line].map((char) =>
        char === '#'
          ? CollisionFlags.SOLID
          : char === '>'
            ? CollisionFlags.BLOCK_RIGHT
            : CollisionFlags.PASSABLE,
      ),
    ),
    ...extra,
  }
}

export const page = (commands: readonly EventCommand[], extra: Record<string, unknown> = {}) => ({
  conditions: [],
  trigger: 'action',
  graphic: null,
  solid: true,
  commands,
  ...extra,
})

export const text = (value: string): EventCommand => ({ command: 'ShowText', text: value })

/** A small world: a walled room with an NPC, a door to a second map, and a switch-gated chest. */
export const buildProject = (
  overrides: { maps?: readonly unknown[]; meta?: object } = {},
): Project => {
  const starter = createStarterProject('Headless Quest')
  const room = mapFromAscii(
    1,
    rows('..........', '.#######..', '.........>', '..........', '..........'),
    {
      bgm: { name: 'town', volume: 80, pitch: 100 },
      events: [
        {
          id: 1,
          name: 'Elder',
          x: 5,
          y: 3,
          pages: [
            page([text('Welcome, traveller.'), { command: 'SetSwitch', switchId: 1, value: true }]),
            page([text('Good luck out there.')], {
              conditions: [{ type: 'switch', switchId: 1, equals: true }],
            }),
          ],
        },
        {
          id: 2,
          name: 'Door',
          x: 8,
          y: 4,
          pages: [
            page(
              [
                { command: 'PlaySE', name: 'door', volume: 90, pitch: 100 },
                { command: 'TransferPlayer', mapId: 2, x: 1, y: 1, direction: 'right' },
              ],
              { trigger: 'touch', solid: false },
            ),
          ],
        },
      ],
    },
  )
  const cellar = mapFromAscii(2, rows('....', '....', '....'), {
    bgm: { name: 'cellar', volume: 70, pitch: 100 },
  })
  return ProjectSchema.parse({
    ...starter,
    meta: { ...starter.meta, startMapId: 1, startX: 2, startY: 3, ...overrides.meta },
    maps: overrides.maps ?? [room, cellar],
  })
}
