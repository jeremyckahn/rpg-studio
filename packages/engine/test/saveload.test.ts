import { SaveStateSchema } from '@rpgstudio/core'
import { describe, expect, it } from 'vitest'

import { createHeadlessGame } from '../src'
import { recorder } from './helpers'
import { buildProject, mapFromAscii, page, rows, text } from './fixtures'

const SEQUENCE = ['right', 'right', 'down', 'left', 'up', 'up', 'right'] as const

const newGame = (seed = 1) =>
  createHeadlessGame(buildProject({ meta: { startX: 2, startY: 3 } }), { seed })

describe('save and load', () => {
  it('produces a save that satisfies SaveStateSchema', () => {
    const headless = newGame()
    SEQUENCE.forEach((direction) => headless.step(direction))
    const save = headless.game.serialize()
    expect(SaveStateSchema.safeParse(save).success).toBe(true)
    expect(save).toMatchObject({
      version: 1,
      projectName: 'Headless Quest',
      mapId: 1,
      party: [{ actorId: 1, level: 1 }],
      gold: 0,
    })
  })

  it('round-trips the full state through JSON and the Zod schema', () => {
    const headless = newGame(42)
    headless.pressConfirm() // nothing nearby: no event
    SEQUENCE.forEach((direction) => headless.step(direction))
    const save = headless.game.serialize()

    const fresh = newGame(7)
    const result = fresh.game.restore(JSON.parse(JSON.stringify(save)))
    expect(result).toEqual({ success: true, data: undefined })
    expect(fresh.game.serialize()).toEqual(save)
    expect(fresh.game.snapshot()).toEqual(headless.game.snapshot())
  })

  it('restores switches, variables, gold, party and event state', () => {
    const headless = newGame()
    headless.walkTo({ x: 5, y: 4 })
    headless.step('up') // face the Elder
    headless.pressConfirm()
    headless.pressConfirm() // sets switch 1
    const save = {
      ...headless.game.serialize(),
      gold: 120,
      variables: { '3': 7 },
      party: [{ actorId: 1, level: 4, experience: 250, hp: 90, mp: 12 }],
    }

    const fresh = newGame()
    expect(fresh.game.restore(save).success).toBe(true)
    expect(fresh.game.snapshot().switches).toEqual({ 1: true })
    expect(fresh.game.snapshot().variables).toEqual({ 3: 7 })
    expect(fresh.game.state.gold).toBe(120)
    expect(fresh.game.state.party).toEqual(save.party)
    // The Elder is on page 2 after restoring switch 1.
    const elder = [...fresh.game.world.with('eventId')].find((e) => e.eventId === 1)
    expect(elder?.activePage).toBe(1)
  })

  it('continues exactly like the original run (determinism across restore)', () => {
    // Inputs are a pure function of the tick number, which a save preserves.
    const inputs = (tick: number) => ({
      direction:
        (['right', 'down', 'left', 'up', null] as const)[Math.floor(tick / 17) % 5] ?? null,
      confirm: tick % 53 === 0,
    })
    const original = newGame(3)
    original.simulateTicks(200, inputs)
    original.settle() // saving happens between steps
    const save = original.game.serialize()

    const resumed = newGame(3)
    expect(resumed.game.restore(save).success).toBe(true)
    expect(resumed.game.state.tick).toBe(original.game.state.tick)

    original.simulateTicks(1_000, inputs)
    resumed.simulateTicks(1_000, inputs)
    expect(resumed.game.snapshot()).toEqual(original.game.snapshot())
    expect(resumed.game.serialize()).toEqual(original.game.serialize())
    // The continued run really did something: the player ended up elsewhere.
    const { x, y } = original.game.snapshot().player
    expect({ x, y }).not.toEqual({ x: save.player.x, y: save.player.y })
  })

  it('saves the destination tile when the player is mid-step', () => {
    const headless = newGame()
    headless.hold('right', 5)
    expect(headless.game.serialize().player).toMatchObject({ x: 3, y: 3, direction: 'right' })
  })

  it('restores onto another map', () => {
    const headless = createHeadlessGame(
      buildProject({ meta: { startX: 8, startY: 3, startDirection: 'down' } }),
    )
    headless.step('down')
    const save = headless.game.serialize()
    expect(save.mapId).toBe(2)

    const fresh = newGame()
    expect(fresh.game.restore(save).success).toBe(true)
    expect(fresh.game.snapshot()).toMatchObject({ mapId: 2, player: { x: 1, y: 1 } })
  })

  it('restores the RNG so random draws continue the same sequence', () => {
    const a = newGame(11)
    a.game.state.rng.next()
    a.game.state.rng.next()
    const save = a.game.serialize()
    const expected = a.game.state.rng.next()

    const b = newGame(99)
    b.game.restore(save)
    expect(b.game.state.rng.next()).toBe(expected)
  })

  it('refuses to save while an event is running', () => {
    const project = buildProject({
      maps: [
        mapFromAscii(1, rows('...', '...'), {
          events: [{ id: 1, x: 1, y: 0, pages: [page([text('Hm')])] }],
        }),
      ],
      meta: { startX: 1, startY: 1, startDirection: 'up' },
    })
    const headless = createHeadlessGame(project)
    headless.pressConfirm()
    expect(headless.game.canSave()).toBe(false)
    expect(() => headless.game.serialize()).toThrow(/event is running/)
    headless.pressConfirm()
    expect(headless.game.canSave()).toBe(true)
  })

  describe('rejects inconsistent saves without touching the running game', () => {
    const good = () => {
      const headless = newGame()
      headless.step('right')
      return headless.game.serialize()
    }

    const cases: readonly [string, (save: ReturnType<typeof good>) => unknown, RegExp][] = [
      ['unknown fields', (s) => ({ ...s, cheats: true }), /Invalid save/],
      ['wrong version', (s) => ({ ...s, version: 2 }), /Invalid save/],
      ['missing map', (s) => ({ ...s, mapId: 9 }), /map 9/],
      ['player outside map', (s) => ({ ...s, player: { ...s.player, x: 500 } }), /outside the map/],
      [
        'missing actor',
        (s) => ({ ...s, party: [{ actorId: 77, level: 1, experience: 0, hp: 1, mp: 0 }] }),
        /missing actor 77/,
      ],
      [
        'unknown event',
        (s) => ({ ...s, entities: [{ eventId: 55, x: 0, y: 0, direction: 'up' }] }),
        /event 55/,
      ],
      ['bad switch key', (s) => ({ ...s, switches: { zero: true } }), /Invalid save/],
      ['not an object', () => 'save', /Invalid save/],
    ]

    it.each(cases)('%s', (_name, corrupt, message) => {
      const headless = newGame()
      headless.step('down')
      const before = headless.game.snapshot()
      const result = headless.game.restore(corrupt(good()))
      expect(result.success).toBe(false)
      expect(!result.success && result.error).toMatch(message)
      expect(headless.game.snapshot()).toEqual(before)
    })
  })

  it('emits loaded and mapLoaded events on restore', () => {
    const headless = newGame()
    const seen = recorder<string>()
    headless.game.bus.on('loaded', () => {
      seen.record('loaded')
    })
    headless.game.bus.on('mapLoaded', ({ mapId }) => {
      seen.record(`map:${mapId}`)
    })
    headless.game.restore(headless.game.serialize())
    expect(seen.values).toEqual(['map:1', 'loaded'])
  })
})
