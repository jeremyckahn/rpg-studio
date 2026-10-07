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
/** Dispatches a setup action and throws, naming the reason, when the project refuses it. */
const checked =
  (studio: Studio) =>
  async (action: unknown): Promise<void> => {
    const result = await studio.dispatch(action)
    if (!result.success) throw new Error(`Setup failed: ${result.error ?? 'unknown'}`)
  }

export const buildDemoGame = async (studio: Studio): Promise<void> => {
  const check = checked(studio)

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

/** What the clock from `addGameClock` says when it runs out. */
export const GAME_CLOCK_TEXT = 'The clock ran out.'

/**
 * Adds a clock to the Village that counts the game's own ticks, so a test can wait for "this many
 * ticks have passed" instead of sleeping for a guessed number of milliseconds. It starts the tick
 * after the greeting has been dismissed (switch 2) and, `frames` ticks later, says
 * `GAME_CLOCK_TEXT` once. A parallel event counts in the simulation's own time, so a slow machine
 * simply takes longer in real time. The message is an autorun event, so it only appears when
 * nothing else (a probe, an NPC) is speaking: if the player stumbles into something first, the
 * clock text never shows and the test fails instead of passing by accident.
 */
export const addGameClock = async (studio: Studio, frames: number): Promise<void> => {
  await checked(studio)({
    type: 'project/upsertMapEvent',
    payload: {
      mapId: 1,
      event: {
        id: 6,
        name: 'Clock',
        x: 0,
        y: 0,
        pages: [
          {
            conditions: [
              { type: 'switch', switchId: 2, equals: true },
              { type: 'switch', switchId: 3, equals: false },
            ],
            trigger: 'parallel',
            solid: false,
            commands: [
              { command: 'Wait', frames },
              { command: 'SetSwitch', switchId: 3, value: true },
            ],
          },
          {
            conditions: [
              { type: 'switch', switchId: 3, equals: true },
              { type: 'switch', switchId: 4, equals: false },
            ],
            trigger: 'autorun',
            solid: false,
            commands: [
              { command: 'ShowText', text: GAME_CLOCK_TEXT },
              { command: 'SetSwitch', switchId: 4, value: true },
            ],
          },
        ],
      },
    },
  })
}

/** What the notices from `addTransferNotices` say. */
export const CELLAR_NOTICE = 'You are in the cellar.'
export const VILLAGE_NOTICE = 'Back in the village.'

/**
 * Makes both doors observable: an autorun notice speaks once on arriving in the Cellar and once
 * on coming back to the Village, so a test can wait for the transfer instead of guessing when it
 * has happened.
 */
export const addTransferNotices = async (studio: Studio): Promise<void> => {
  const check = checked(studio)
  await check({
    type: 'project/upsertMapEvent',
    payload: {
      mapId: 2,
      event: {
        id: 3,
        name: 'Cellar notice',
        x: 0,
        y: 0,
        pages: [
          {
            conditions: [{ type: 'switch', switchId: 5, equals: false }],
            trigger: 'autorun',
            solid: false,
            commands: [
              { command: 'ShowText', text: CELLAR_NOTICE },
              { command: 'SetSwitch', switchId: 5, value: true },
            ],
          },
        ],
      },
    },
  })
  await check({
    type: 'project/upsertMapEvent',
    payload: {
      mapId: 1,
      event: {
        id: 7,
        name: 'Village notice',
        x: 0,
        y: 0,
        pages: [
          {
            conditions: [
              { type: 'switch', switchId: 5, equals: true },
              { type: 'switch', switchId: 6, equals: false },
            ],
            trigger: 'autorun',
            solid: false,
            commands: [
              { command: 'ShowText', text: VILLAGE_NOTICE },
              { command: 'SetSwitch', switchId: 6, value: true },
            ],
          },
        ],
      },
    },
  })
}
