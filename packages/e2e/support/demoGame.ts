import { type Studio } from './studio.ts'

/**
 * Builds a small playable game through the editor's own project actions, the way an agent would:
 *
 * Map 1 "Village" (20x15), the player starts at (10, 7) facing down.
 *   (10, 8)  Elder, solid, action: counts visits with a variable and a conditional branch.
 *   (10, 6)  Door, non-solid, touch: transfers to the Cellar at (5, 3).
 *   (9, 7)   a wall (collision) ... and (8, 7) a "Probe" behind it that must stay unreachable.
 *   (11, 7)  a "Probe" that is reachable.
 *   (3, 3)   Greeter, autorun: speaks once at boot (switch 2 guards it).
 * Map 2 "Cellar" (10x8)
 *   (5, 4)   Cat, solid, action.
 *   (5, 2)   Stairs, non-solid, touch: back to the Village at (10, 7).
 */
export const buildDemoGame = async (studio: Studio): Promise<void> => {
  const check = async (action: unknown): Promise<void> => {
    const result = await studio.dispatch(action)
    if (!result.success) throw new Error(`Setup failed: ${result.error ?? 'unknown'}`)
  }

  await check({ type: 'project/renameMap', payload: { mapId: 1, name: 'Village' } })
  await check({
    type: 'project/createMap',
    payload: { name: 'Cellar', width: 10, height: 8, tileSize: 16 },
  })
  await check({
    type: 'project/setCollision',
    payload: { mapId: 1, cells: [{ x: 9, y: 7, flags: 1 }] },
  })

  const event = (
    mapId: number,
    id: number,
    name: string,
    x: number,
    y: number,
    pages: readonly unknown[],
  ) =>
    check({ type: 'project/upsertMapEvent', payload: { mapId, event: { id, name, x, y, pages } } })

  await event(1, 1, 'Elder', 10, 8, [
    {
      trigger: 'action',
      solid: true,
      commands: [
        { command: 'SetVariable', variableId: 1, operation: 'add', value: 1 },
        {
          command: 'ConditionalBranch',
          condition: { type: 'variable', variableId: 1, comparator: '==', value: 1 },
          then: [{ command: 'ShowText', text: 'First visit.' }],
          else: [{ command: 'ShowText', text: 'You again.' }],
        },
      ],
    },
  ])
  await event(1, 2, 'Door', 10, 6, [
    {
      trigger: 'touch',
      solid: false,
      commands: [{ command: 'TransferPlayer', mapId: 2, x: 5, y: 3, direction: 'down' }],
    },
  ])
  await event(1, 3, 'Left probe', 8, 7, [
    {
      trigger: 'touch',
      solid: false,
      commands: [{ command: 'ShowText', text: 'Reached the left probe.' }],
    },
  ])
  await event(1, 4, 'Right probe', 11, 7, [
    {
      trigger: 'touch',
      solid: false,
      commands: [{ command: 'ShowText', text: 'Reached the right probe.' }],
    },
  ])
  await event(1, 5, 'Greeter', 3, 3, [
    {
      conditions: [{ type: 'switch', switchId: 2, equals: false }],
      trigger: 'autorun',
      solid: false,
      commands: [
        { command: 'ShowText', text: 'Welcome to the village.' },
        { command: 'SetSwitch', switchId: 2, value: true },
      ],
    },
    {
      conditions: [{ type: 'switch', switchId: 2, equals: true }],
      trigger: 'action',
      commands: [],
    },
  ])
  await event(2, 1, 'Cat', 5, 4, [
    { trigger: 'action', solid: true, commands: [{ command: 'ShowText', text: 'Meow.' }] },
  ])
  await event(2, 2, 'Stairs', 5, 2, [
    {
      trigger: 'touch',
      solid: false,
      commands: [{ command: 'TransferPlayer', mapId: 1, x: 10, y: 7, direction: 'down' }],
    },
  ])
}
