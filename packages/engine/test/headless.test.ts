import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { createRng } from '@rpgstudio/core'
import { describe, expect, it } from 'vitest'
import { ZodError } from 'zod'

import { type GameInput, createHeadlessGame } from '../src'
import { buildProject, mapFromAscii, page, rows, text } from './fixtures'

describe('headless execution', () => {
  it('runs without window, document or WebGL', () => {
    expect(typeof window).toBe('undefined')
    expect(typeof document).toBe('undefined')
    const headless = createHeadlessGame(buildProject())
    expect(headless.simulateTicks(10).ticksRun).toBe(10)
  })

  it('keeps rendering and audio libraries out of the headless module graph', () => {
    const sources = ['ecs', 'game', 'headless'].flatMap((dir) => {
      const root = join(__dirname, '..', 'src', dir)
      return readdirSync(root, { recursive: true, encoding: 'utf8' })
        .filter((file) => file.endsWith('.ts'))
        .map((file) => ({ file: `${dir}/${file}`, text: readFileSync(join(root, file), 'utf8') }))
    })
    expect(sources.length).toBeGreaterThan(5)
    sources.forEach(({ file, text }) => {
      expect(text, file).not.toMatch(/from\s+['"](?:pixi|@pixi)/)
      expect(text, file).not.toMatch(/\b(?:window|document)\./)
    })
  })

  it('exposes simulateTicks(count) and reports the tick reached', () => {
    const headless = createHeadlessGame(buildProject())
    const result = headless.simulateTicks(30, { direction: 'right', confirm: false })
    expect(result.ticksRun).toBe(30)
    expect(result.snapshot.tick).toBe(30)
    expect(headless.game.snapshot().tick).toBe(30)
  })

  it('rejects invalid tick counts', () => {
    const headless = createHeadlessGame(buildProject())
    expect(() => headless.simulateTicks(-1)).toThrow(RangeError)
    expect(() => headless.simulateTicks(1.5)).toThrow(RangeError)
    expect(headless.simulateTicks(0).ticksRun).toBe(0)
  })

  it('validates untrusted projects with Zod before running them', () => {
    const project = buildProject() as unknown as Record<string, unknown>
    expect(() => createHeadlessGame({ ...project, cheats: true })).toThrow(ZodError)
    expect(() => createHeadlessGame({})).toThrow(ZodError)
    expect(() => createHeadlessGame(JSON.parse(JSON.stringify(project)))).not.toThrow()
  })

  it('can run many thousands of ticks', () => {
    const headless = createHeadlessGame(buildProject({ meta: { startX: 0, startY: 0 } }))
    const rng = createRng(5)
    const pad = (): GameInput => ({
      direction: rng.pick(['up', 'down', 'left', 'right', null] as const),
      confirm: rng.next() < 0.05,
    })
    const result = headless.simulateTicks(60_000, pad)
    expect(result.snapshot.tick).toBe(60_000)
  })

  it('is deterministic for identical seeds and inputs', () => {
    const run = () => {
      const headless = createHeadlessGame(buildProject({ meta: { startX: 2, startY: 3 } }), {
        seed: 99,
      })
      const rng = createRng(7)
      headless.simulateTicks(3_000, () => ({
        direction: rng.pick(['up', 'down', 'left', 'right', null] as const),
        confirm: rng.next() < 0.1,
      }))
      return {
        snapshot: headless.game.snapshot(),
        messages: headless.messages(),
        audio: headless.audio.calls(),
      }
    }
    expect(run()).toEqual(run())
  })

  it('exposes a seeded RNG whose state survives in saves', () => {
    const a = createHeadlessGame(buildProject(), { seed: 5 })
    const b = createHeadlessGame(buildProject(), { seed: 5 })
    const c = createHeadlessGame(buildProject(), { seed: 6 })
    expect(a.game.state.rng.next()).toBe(b.game.state.rng.next())
    expect(a.game.state.rng.next()).not.toBe(c.game.state.rng.next())
  })
})

describe('walkTo (AI playtesting)', () => {
  it('walks the shortest route and stops exactly on the target', () => {
    const headless = createHeadlessGame(buildProject({ meta: { startX: 0, startY: 0 } }))
    const result = headless.walkTo({ x: 4, y: 0 })
    expect(result).toMatchObject({ reached: true })
    expect(headless.game.snapshot().player).toMatchObject({ x: 4, y: 0, moving: false })
    expect(result.ticks).toBe(4 * 15)
  })

  it('routes around walls and solid events', () => {
    const headless = createHeadlessGame(buildProject({ meta: { startX: 2, startY: 3 } }))
    const result = headless.walkTo({ x: 5, y: 2 }) // the Elder blocks (5, 3); a wall runs along row 1
    expect(result.reached).toBe(true)
    expect(headless.game.snapshot().player).toMatchObject({ x: 5, y: 2 })
  })

  it('reports when there is no route', () => {
    const project = buildProject({
      maps: [mapFromAscii(1, rows('..#..', '..#..', '..#..'))],
      meta: { startX: 0, startY: 0 },
    })
    const headless = createHeadlessGame(project)
    expect(headless.walkTo({ x: 4, y: 0 })).toEqual({ reached: false, ticks: 0, reason: 'no-path' })
    expect(headless.walkTo({ x: 2, y: 1 })).toMatchObject({ reached: false, reason: 'no-path' })
  })

  it('stops when an event takes control of the player', () => {
    const project = buildProject({
      maps: [
        mapFromAscii(1, rows('.....'), {
          events: [
            {
              id: 1,
              x: 2,
              y: 0,
              pages: [page([text('Stop!')], { trigger: 'touch', solid: false })],
            },
          ],
        }),
      ],
      meta: { startX: 0, startY: 0 },
    })
    const headless = createHeadlessGame(project)
    const result = headless.walkTo({ x: 4, y: 0 })
    expect(result).toMatchObject({ reached: false, reason: 'event' })
    expect(headless.game.snapshot()).toMatchObject({ message: 'Stop!', player: { x: 2 } })
  })

  it('times out instead of looping forever', () => {
    const headless = createHeadlessGame(buildProject({ meta: { startX: 0, startY: 0 } }))
    expect(headless.walkTo({ x: 4, y: 0 }, { maxTicks: 10 })).toMatchObject({
      reached: false,
      reason: 'timeout',
    })
  })

  it('returns immediately when already at the target', () => {
    const headless = createHeadlessGame(buildProject())
    expect(headless.walkTo({ x: 2, y: 3 })).toEqual({ reached: true, ticks: 0 })
  })
})
