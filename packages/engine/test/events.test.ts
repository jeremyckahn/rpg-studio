import { type EventCommand, type Project, createStarterProject } from '@rpgstudio/core'
import { describe, expect, it } from 'vitest'

import { GameError, createGame, createHeadlessGame } from '../src'
import { buildProject, mapFromAscii, page, rows, text } from './fixtures'

const solo = (
  events: readonly unknown[],
  meta: Record<string, unknown> = {},
  lines: readonly string[] = ['.....', '.....', '.....'],
) =>
  buildProject({
    maps: [mapFromAscii(1, lines, { events })],
    meta: { startX: 1, startY: 2, startDirection: 'up', ...meta },
  })

const commandsEvent = (
  commands: readonly EventCommand[],
  extra: Record<string, unknown> = {},
  position = { x: 1, y: 1 },
) => ({ id: 1, ...position, pages: [page(commands, extra)] })

describe('action events', () => {
  it('talks to an adjacent NPC, locks the player, and advances pages through switches', () => {
    const headless = createHeadlessGame(
      buildProject({ meta: { startX: 5, startY: 4, startDirection: 'up' } }),
    )
    headless.pressConfirm()
    expect(headless.game.snapshot()).toMatchObject({
      message: 'Welcome, traveller.',
      eventRunning: true,
    })

    headless.pressConfirm() // dismiss: SetSwitch runs, the event ends
    expect(headless.game.snapshot()).toMatchObject({
      message: null,
      eventRunning: false,
      switches: { 1: true },
    })

    headless.pressConfirm() // the Elder now shows page 2
    expect(headless.game.snapshot().message).toBe('Good luck out there.')
    expect(headless.messages().map((m) => m.text)).toEqual([
      'Welcome, traveller.',
      'Good luck out there.',
    ])
  })

  it('needs the player to be facing the event', () => {
    const headless = createHeadlessGame(
      buildProject({ meta: { startX: 5, startY: 4, startDirection: 'down' } }),
    )
    headless.pressConfirm()
    expect(headless.game.snapshot().message).toBeNull()
  })

  it('does nothing when confirm is pressed away from any event', () => {
    const headless = createHeadlessGame(buildProject())
    headless.pressConfirm()
    expect(headless.game.snapshot()).toMatchObject({ message: null, eventRunning: false })
  })

  it('does not restart an event on the tick its message is dismissed', () => {
    const headless = createHeadlessGame(solo([commandsEvent([text('Hi')])]))
    headless.pressConfirm()
    headless.pressConfirm()
    expect(headless.messages()).toHaveLength(1)
    expect(headless.game.snapshot().eventRunning).toBe(false)
  })

  it('shows messages one at a time in order', () => {
    const headless = createHeadlessGame(
      solo([commandsEvent([text('One'), text('Two'), text('Three')])]),
    )
    headless.pressConfirm()
    expect(headless.game.snapshot().message).toBe('One')
    headless.simulateTicks(30) // not dismissed without confirm
    expect(headless.game.snapshot().message).toBe('One')
    headless.pressConfirm()
    expect(headless.game.snapshot().message).toBe('Two')
    headless.pressConfirm()
    expect(headless.game.snapshot().message).toBe('Three')
    headless.pressConfirm()
    expect(headless.game.snapshot()).toMatchObject({ message: null, eventRunning: false })
  })
})

describe('touch events and transfers', () => {
  it('transfers the player to another map when they step onto a door', () => {
    const headless = createHeadlessGame(
      buildProject({ meta: { startX: 8, startY: 3, startDirection: 'down' } }),
    )
    headless.step('down')
    expect(headless.game.snapshot()).toMatchObject({
      mapId: 2,
      player: { x: 1, y: 1, direction: 'right', moving: false },
    })
    expect(headless.game.state.map.id).toBe(2)
    expect([...headless.game.world.with('eventId')]).toHaveLength(0)
  })

  it('plays the door sound, then switches background music for the new map', () => {
    const headless = createHeadlessGame(
      buildProject({ meta: { startX: 8, startY: 3, startDirection: 'down' } }),
    )
    headless.step('down')
    expect(headless.audio.calls().map((c) => `${c.tier}:${c.cue?.name}`)).toEqual([
      'bgm:town',
      'se:door',
      'bgm:cellar',
    ])
  })

  it('does not restart music that is already playing', () => {
    const music = { name: 'theme', volume: 90, pitch: 100 }
    const project = buildProject({
      maps: [
        mapFromAscii(1, rows('...', '...'), {
          bgm: music,
          events: [
            commandsEvent(
              [{ command: 'TransferPlayer', mapId: 2, x: 0, y: 0 }],
              { trigger: 'touch', solid: false },
              { x: 1, y: 0 },
            ),
          ],
        }),
        mapFromAscii(2, rows('...'), { bgm: music }),
      ],
      meta: { startX: 0, startY: 0, startDirection: 'right' },
    })
    const headless = createHeadlessGame(project)
    headless.step('right')
    expect(headless.game.snapshot().mapId).toBe(2)
    expect(headless.audio.calls().filter((c) => c.tier === 'bgm')).toHaveLength(1)
  })

  it('triggers solid touch events when the player bumps into them', () => {
    const headless = createHeadlessGame(
      solo([commandsEvent([text('Ouch!')], { trigger: 'touch' })], { startX: 1, startY: 2 }),
    )
    headless.hold('up', 20)
    expect(headless.game.snapshot()).toMatchObject({ message: 'Ouch!', player: { x: 1, y: 2 } })
  })

  it('does not trigger a touch event just by standing next to it', () => {
    const headless = createHeadlessGame(
      solo([commandsEvent([text('Boo')], { trigger: 'touch', solid: false }, { x: 3, y: 2 })], {
        startX: 1,
        startY: 2,
      }),
    )
    headless.step('right')
    expect(headless.game.snapshot().message).toBeNull()
    headless.step('right')
    expect(headless.game.snapshot().message).toBe('Boo')
  })

  it('fails loudly when a transfer targets a missing map in unvalidated data', () => {
    const base = createStarterProject('Broken')
    const broken: Project = {
      ...base,
      maps: base.maps.map((map) => ({
        ...map,
        events: [
          {
            id: 1,
            name: '',
            x: 11,
            y: 7,
            pages: [
              {
                conditions: [],
                trigger: 'touch',
                graphic: null,
                solid: false,
                commands: [{ command: 'TransferPlayer', mapId: 99, x: 0, y: 0 }],
              },
            ],
          },
        ],
      })),
    }
    const game = createGame({ project: broken })
    expect(() => {
      game.tick({ direction: 'right', confirm: false })
      for (let i = 0; i < 30; i++) game.tick({ direction: 'right', confirm: false })
    }).toThrow(GameError)
  })
})

describe('interpreter', () => {
  it('evaluates variables and conditional branches', () => {
    const branch = (value: number): EventCommand[] => [
      { command: 'SetVariable', variableId: 1, operation: 'set', value },
      { command: 'SetVariable', variableId: 1, operation: 'add', value: 5 },
      {
        command: 'ConditionalBranch',
        condition: { type: 'variable', variableId: 1, comparator: '>=', value: 10 },
        then: [text('big')],
        else: [text('small')],
      },
    ]
    const small = createHeadlessGame(solo([commandsEvent(branch(0))]))
    small.pressConfirm()
    expect(small.game.snapshot()).toMatchObject({ message: 'small', variables: { 1: 5 } })

    const big = createHeadlessGame(solo([commandsEvent(branch(7))]))
    big.pressConfirm()
    expect(big.game.snapshot()).toMatchObject({ message: 'big', variables: { 1: 12 } })
  })

  it('supports every variable operation', () => {
    const ops = (['set', 'add', 'subtract', 'multiply'] as const).map(
      (operation): EventCommand => ({ command: 'SetVariable', variableId: 1, operation, value: 3 }),
    )
    const headless = createHeadlessGame(solo([commandsEvent(ops)]))
    headless.pressConfirm()
    // set 3 -> add 3 = 6 -> subtract 3 = 3 -> multiply 3 = 9
    expect(headless.game.snapshot().variables[1]).toBe(9)
  })

  it('branches on switches', () => {
    const headless = createHeadlessGame(
      solo([
        commandsEvent([
          { command: 'SetSwitch', switchId: 4, value: true },
          {
            command: 'ConditionalBranch',
            condition: { type: 'switch', switchId: 4, equals: true },
            then: [text('on')],
            else: [text('off')],
          },
        ]),
      ]),
    )
    headless.pressConfirm()
    expect(headless.game.snapshot().message).toBe('on')
  })

  it('waits exactly the requested number of ticks', () => {
    const headless = createHeadlessGame(
      solo([
        commandsEvent([
          { command: 'SetVariable', variableId: 1, operation: 'set', value: 1 },
          { command: 'Wait', frames: 10 },
          { command: 'SetVariable', variableId: 1, operation: 'set', value: 2 },
        ]),
      ]),
    )
    headless.pressConfirm()
    expect(headless.game.snapshot().variables[1]).toBe(1)
    headless.simulateTicks(10)
    expect(headless.game.snapshot().variables[1]).toBe(1)
    headless.simulateTicks(1)
    expect(headless.game.snapshot().variables[1]).toBe(2)
  })

  it('plays all four audio tiers through the audio port', () => {
    const cue = (command: 'PlayBGM' | 'PlayBGS' | 'PlayME' | 'PlaySE'): EventCommand => ({
      command,
      name: command.toLowerCase(),
      volume: 70,
      pitch: 110,
    })
    const headless = createHeadlessGame(
      solo([commandsEvent([cue('PlayBGM'), cue('PlayBGS'), cue('PlayME'), cue('PlaySE')])]),
    )
    headless.pressConfirm()
    const expectedCue = (name: string) => ({ name, volume: 70, pitch: 110 })
    expect(headless.audio.calls()).toEqual([
      { action: 'play', tier: 'bgm', cue: expectedCue('playbgm') },
      { action: 'play', tier: 'bgs', cue: expectedCue('playbgs') },
      { action: 'play', tier: 'me', cue: expectedCue('playme') },
      { action: 'play', tier: 'se', cue: expectedCue('playse') },
    ])
  })
})

describe('parallel and autorun events', () => {
  it('runs parallel events alongside the player, repeating forever', () => {
    const headless = createHeadlessGame(
      solo([
        commandsEvent(
          [
            { command: 'SetVariable', variableId: 1, operation: 'add', value: 1 },
            { command: 'Wait', frames: 9 },
          ],
          { trigger: 'parallel', solid: false },
        ),
      ]),
    )
    const counter = () => headless.game.snapshot().variables[1] ?? 0
    headless.simulateTicks(1)
    expect(counter()).toBe(1)
    headless.simulateTicks(10) // tick 11
    expect(counter()).toBe(1)
    headless.simulateTicks(1) // tick 12: second run
    expect(counter()).toBe(2)
    headless.simulateTicks(11) // tick 23: third run
    expect(counter()).toBe(3)
    headless.step('right') // the player is free to move meanwhile
    expect(headless.game.snapshot().player.x).toBe(2)
  })

  it('runs an autorun event until its page conditions stop holding', () => {
    const event = {
      id: 1,
      name: '',
      x: 4,
      y: 0,
      pages: [
        page([text('Intro'), { command: 'SetSwitch', switchId: 2, value: true }], {
          trigger: 'autorun',
          solid: false,
          conditions: [{ type: 'switch', switchId: 2, equals: false }],
        }),
      ],
    }
    const headless = createHeadlessGame(solo([event]))
    headless.simulateTicks(1)
    expect(headless.game.snapshot()).toMatchObject({ message: 'Intro', eventRunning: true })
    headless.hold('right', 30) // locked out while it runs
    expect(headless.game.snapshot().player.x).toBe(1)
    headless.pressConfirm()
    headless.simulateTicks(5)
    expect(headless.game.snapshot()).toMatchObject({ eventRunning: false, switches: { 2: true } })
    expect(headless.messages()).toHaveLength(1)
    headless.step('right')
    expect(headless.game.snapshot().player.x).toBe(2)
  })

  it('picks the highest page whose conditions hold', () => {
    const event = {
      id: 1,
      name: '',
      x: 1,
      y: 1,
      pages: [
        page([text('A')]),
        page([text('B')], {
          conditions: [{ type: 'variable', variableId: 1, comparator: '>=', value: 1 }],
        }),
        page([text('C')], { conditions: [{ type: 'switch', switchId: 1, equals: true }] }),
      ],
    }
    const headless = createHeadlessGame(solo([event]))
    const entity = [...headless.game.world.with('eventId')][0]
    expect(entity?.activePage).toBe(0)
  })

  it('hides events whose conditions no page satisfies', () => {
    const event = {
      id: 1,
      name: '',
      x: 1,
      y: 1,
      pages: [
        page([text('Gone')], { conditions: [{ type: 'switch', switchId: 9, equals: true }] }),
      ],
    }
    const headless = createHeadlessGame(solo([event]))
    headless.pressConfirm()
    expect(headless.game.snapshot().message).toBeNull()
    expect([...headless.game.world.with('collision')]).toHaveLength(1) // only the player
  })
})
